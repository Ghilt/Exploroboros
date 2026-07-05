// Run ONE traverser's program for one tick against a FROZEN context. Pure: it reads the tick-start
// overlay + walker state and RETURNS intentions (branches to spawn, tile-registry writes, the walker's
// post-tick self-state) — it never mutates shared state. The runtime (step.ts) applies them, coalesces,
// and stamps visits.
//
// Within a tick: statements run top-to-bottom. The walker's OWN registers (P/Q/R) and settings mutate
// sequentially (a later line sees an earlier `put`), but TILE reads are frozen — a walker never sees its
// own or another walker's tile writes until next tick. So `increase` from co-located walkers accumulates
// order-independently, while a `put` is last-writer-wins in the runtime's traverser order (see step.ts).
// Each firing move/morph adds a branch (capped by max-split); a walker producing no branch is dropped.

import type { Tiling, TileNode } from '../../tiling'
import { nodeById } from '../../tiling'
import { evalNumber, evalPredicate, predReadsTarget, serializePath, type EvalContext, type PathSeg, type TilePath } from '../../dsl'
import type { TileState } from '../../canvas'
import { resolveChain } from './edges'
import { serializeChain, serializeGuard, serializeStmt } from './serialize'
import type { Action, DExpr, EdgeRef, EdgeTarget, Guard, Movement, Program, WriteTarget } from './types'
import type { CandidateTrace, GuardEval, ReadTile, RejectReason, TraverserTrace } from '../trace'

export type WalkerState = {
  tile: string
  heading: number // edge number (0 = top, clockwise) — the edge `straight` exits
  steps: number
  splits: number
  maxSplit: number
  maxSteps: number
  movement: Movement
  p: number
  q: number
  r: number
}

export type ExecInput = {
  tiling: Tiling
  overlay: ReadonlyMap<string, TileState>
  indexById: ReadonlyMap<string, number>
  tileByIndex: ReadonlyArray<string>
  walker: WalkerState
  program: Program
}

export type Branch = { tile: string; heading: number; morphDef?: string }
export type TileWrite = { tile: string; reg: 'a' | 'b' | 'c'; op: 'set' | 'add'; value: number }
export type ExecResult = {
  branches: Branch[]
  tileWrites: TileWrite[]
  // The walker's post-tick self-state, stamped onto every surviving branch.
  next: { maxSplit: number; maxSteps: number; movement: Movement; p: number; q: number; r: number }
}

// Wrap an edge-number heading into 0..n-1 for a tile with `n` sides.
const wrapEdge = (edge: number, n: number) => (n > 0 ? (((Math.round(edge) % n) + n) % n) : 0)

// A hop-shaped path segment IS an EdgeRef (same shape); the terminal target/tile segs are resolved by
// the caller and never reach here.
function segToEdgeRef(seg: PathSeg): EdgeRef | null {
  switch (seg.kind) {
    case 'straight':
      return { kind: 'straight' }
    case 'unvisited':
      return { kind: 'unvisited' }
    case 'turn':
      return { kind: 'turn', dir: seg.dir, n: seg.n }
    case 'edge':
      return { kind: 'edge', index: seg.index }
    case 'target':
    case 'tile':
      return null
  }
}

// Walker-FREE resolution of an `@`-path from a starting tile — for the coloring / predicate context,
// which has no walker (so no heading/movement/destination). Only heading-INDEPENDENT segments resolve:
// a chain of absolute `edge N` hops (`edge k` always lands on local edge k regardless of heading), or a
// single terminal `tile N`. Any relative segment (`straight` / `r`/`l` turns / `nearest-unvisited`) or
// `@target` needs a walker, so the whole path resolves to null — the reading attribute then falls back to
// its default, exactly as when no resolver is supplied at all. Used by the colorizer's `nodeForPath`.
export function resolveAbsolutePath(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  startId: string,
  path: TilePath,
): TileNode | null {
  if (path.length === 0) return nodeById(tiling, startId) ?? null
  const first = path[0]
  if (first.kind === 'tile') return path.length === 1 ? tiling.nodes[first.index] ?? null : null
  const refs: EdgeRef[] = []
  for (const seg of path) {
    if (seg.kind !== 'edge') return null // relative / target segments need a walker
    refs.push({ kind: 'edge', index: seg.index })
  }
  // heading is irrelevant for absolute `edge` refs; pass 0 / 'relative' as inert placeholders.
  const hop = resolveChain(tiling, overlay, startId, 0, 'relative', refs)
  return hop ? nodeById(tiling, hop.tile) ?? null : null
}


// `trace`, when given, is filled with this walker's per-statement decisions (what each guard read,
// every candidate move and why it survived/was rejected). It's the only debug-mode cost: when
// undefined every recording branch short-circuits and no text is serialized — so the headless export
// run (which never passes a trace) is byte-for-byte the same work as before.
export function runProgram(input: ExecInput, trace?: TraverserTrace): ExecResult {
  const { tiling, overlay, indexById, tileByIndex, walker, program } = input
  // Mutable self-state for the tick (sequential within the tick).
  const self = {
    heading: walker.heading,
    movement: walker.movement,
    maxSplit: walker.maxSplit,
    maxSteps: walker.maxSteps,
    p: walker.p,
    q: walker.q,
    r: walker.r,
  }
  const branches: Branch[] = []
  const tileWrites: TileWrite[] = []
  const directives: Array<{ allow: boolean; guard: Guard }> = []

  // The walker attributes the DSL sees (heading = the edge number `straight` exits). Rebuilt each read
  // so it reflects mutations.
  const traverserAttrs = () => ({
    steps: walker.steps,
    splits: walker.splits,
    heading: self.heading,
    p: self.p,
    q: self.q,
    r: self.r,
  })
  const currentNode = nodeById(tiling, walker.tile) ?? null

  // Resolve an attribute's `@`-path to another tile's node (or null at a boundary / missing tile). No
  // path -> the current tile. `@target` -> the move destination under consideration (`dest`), or the
  // current tile outside a move context (so a stray `@target` is never silently always-false). `@tile N`
  // -> the tile with that absolute number. Otherwise chain the edge hops from the current tile/heading.
  const resolvePathNode = (dest: string | null, path: TilePath): TileNode | null => {
    if (path.length === 0) return currentNode
    const first = path[0]
    if (first.kind === 'target') return nodeById(tiling, dest ?? walker.tile) ?? null
    if (first.kind === 'tile') {
      const id = tileByIndex[first.index]
      return id ? nodeById(tiling, id) ?? null : null
    }
    const refs: EdgeRef[] = []
    for (const seg of path) {
      const ref = segToEdgeRef(seg)
      if (!ref) return null // a terminal seg mid-chain (the parser forbids it) -> no tile
      refs.push(ref)
    }
    const hop = resolveChain(tiling, overlay, walker.tile, self.heading, self.movement, refs)
    return hop ? nodeById(tiling, hop.tile) ?? null : null
  }
  // The nodeForPath hook handed to the evaluator. When `record` is given (trace mode only) each
  // resolution is logged for the debug read-tile highlights; otherwise it's a plain resolve (zero cost).
  const makeNodeForPath =
    (dest: string | null, record?: ReadTile[]) =>
    (path: TilePath): TileNode | null => {
      const node = resolvePathNode(dest, path)
      if (record) {
        record.push({
          id: node?.id ?? null,
          role: path[0]?.kind === 'target' ? 'target' : 'read',
          tileType: node?.shape ?? null,
          text: serializePath(path),
        })
      }
      return node
    }
  const ctxFor = (dest: string | null, record?: ReadTile[]): EvalContext | null =>
    currentNode
      ? { node: currentNode, tiling, overlay, indexById, traverser: traverserAttrs(), nodeForPath: makeNodeForPath(dest, record) }
      : null

  // A guard's boolean, rooted at the current tile (its attributes redirect themselves via `@`-paths).
  const evalGuard = (guard: Guard, dest: string | null): boolean => {
    if (guard.pred.kind === 'named') return false // resolved at compile; defensive
    const ctx = ctxFor(dest)
    return ctx ? evalPredicate(guard.pred.pred, ctx) : false
  }
  // As evalGuard, but records the tiles the guard's paths read. Only called under `if (trace)`, so the
  // recording + text serialization never runs on the hot path.
  const evalGuardTraced = (guard: Guard, dest: string | null): { result: boolean; readTiles: ReadTile[] } => {
    const readTiles: ReadTile[] = []
    if (guard.pred.kind === 'named') return { result: false, readTiles }
    const ctx = ctxFor(dest, readTiles)
    return { result: ctx ? evalPredicate(guard.pred.pred, ctx) : false, readTiles }
  }
  const guardEval = (guard: Guard, ev: { result: boolean; readTiles: ReadTile[] }): GuardEval => ({
    text: serializeGuard(guard),
    readTiles: ev.readTiles,
    result: ev.result,
    reason: guard.pred.kind === 'named' ? 'named-unresolved' : undefined,
  })
  const evalDExpr = (d: DExpr): number => {
    const ctx = ctxFor(null)
    return ctx ? evalNumber(d.expr, ctx) : 0
  }

  // Decide whether a candidate destination is allowed. Order (owner's spec): any active `forbid`
  // directive whose guard matches BLOCKS (forbid is strongest); else any active `allow` directive whose
  // guard matches ALLOWS, overriding the move's own guard; else the move's own guard (if any) decides;
  // else allow. So directives, when they match, overpower the move's own guard — an `allow` with nothing
  // to override is a no-op. Each guard reads the current tile unless it carries `@target` (→ `dest`).
  const moveAllowed = (dest: string, ownGuard?: Guard): boolean => {
    for (const d of directives) if (!d.allow && evalGuard(d.guard, dest)) return false
    for (const d of directives) if (d.allow && evalGuard(d.guard, dest)) return true
    if (ownGuard) return evalGuard(ownGuard, dest)
    return true
  }
  // The same verdict as moveAllowed, reporting the FIRST blocker (same order) for the trace. An `allow`
  // match short-circuits to survived; only a `forbid` match or a false own guard rejects.
  const moveAllowedTraced = (dest: string, ownGuard?: Guard): { ok: boolean; reject?: RejectReason } => {
    for (let i = 0; i < directives.length; i += 1) {
      const d = directives[i]
      if (d.allow) continue
      const ev = evalGuardTraced(d.guard, dest)
      if (ev.result) return { ok: false, reject: { by: 'directive', index: i, allow: false, guard: guardEval(d.guard, ev) } }
    }
    for (let i = 0; i < directives.length; i += 1) {
      const d = directives[i]
      if (d.allow && evalGuardTraced(d.guard, dest).result) return { ok: true }
    }
    if (ownGuard) {
      const ev = evalGuardTraced(ownGuard, dest)
      if (!ev.result) return { ok: false, reject: { by: 'own-guard', guard: guardEval(ownGuard, ev) } }
    }
    return { ok: true }
  }

  const addMoves = (target: EdgeTarget, ownGuard?: Guard, morphDef?: string, record?: CandidateTrace[]) => {
    for (const chain of target) {
      if (branches.length >= self.maxSplit) {
        if (!record) break // fast path: cap reached, nothing more can be added
        record.push({ chainText: serializeChain(chain), dest: null, destType: null, heading: null, survived: false, reject: { by: 'max-split' } })
        continue
      }
      const hop = resolveChain(tiling, overlay, walker.tile, self.heading, self.movement, chain)
      if (!hop) {
        if (record)
          record.push({ chainText: serializeChain(chain), dest: null, destType: null, heading: null, survived: false, reject: { by: 'boundary' } })
        continue
      }
      if (record) {
        const v = moveAllowedTraced(hop.tile, ownGuard)
        record.push({ chainText: serializeChain(chain), dest: hop.tile, destType: nodeById(tiling, hop.tile)?.shape ?? null, heading: hop.heading, survived: v.ok, reject: v.reject })
        if (!v.ok) continue
      } else if (!moveAllowed(hop.tile, ownGuard)) {
        continue
      }
      branches.push({ tile: hop.tile, heading: hop.heading, morphDef })
    }
  }

  // Apply a put/increase to its target. A tile registry resolves its `@`-path to a tile (the CURRENT
  // tile when path-less; an off-grid path is a no-op, mirroring how an off-grid READ falls back to a
  // default); a walker register mutates the walker's own P/Q/R in place for the rest of the tick.
  const applyWrite = (target: WriteTarget, op: 'set' | 'add', value: number) => {
    if (target.kind === 'walker-reg') {
      if (target.reg === 'P') self.p = op === 'set' ? value : self.p + value
      else if (target.reg === 'Q') self.q = op === 'set' ? value : self.q + value
      else self.r = op === 'set' ? value : self.r + value
      return
    }
    const node = resolvePathNode(null, target.path ?? [])
    if (node) tileWrites.push({ tile: node.id, reg: target.reg, op, value })
  }

  const applyAction = (a: Action, ownGuard?: Guard, record?: CandidateTrace[]) => {
    switch (a.kind) {
      case 'move':
        addMoves(a.target, ownGuard, undefined, record)
        return
      case 'morph':
        addMoves(a.target, ownGuard, a.def, record)
        return
      case 'put': {
        const value = evalDExpr(a.value)
        for (const t of a.target) applyWrite(t, 'set', value)
        return
      }
      case 'increase': {
        const by = evalDExpr(a.by)
        for (const t of a.target) applyWrite(t, 'add', by)
        return
      }
      case 'update':
        if (a.setting === 'max-split') self.maxSplit = Math.max(0, Math.round(a.value as number))
        else if (a.setting === 'max-steps') self.maxSteps = Math.max(1, Math.round(a.value as number))
        else if (a.setting === 'heading') self.heading = wrapEdge(a.value as number, nodeById(tiling, walker.tile)?.sides.length ?? 0)
        else self.movement = a.value as Movement
        return
    }
  }

  for (const stmt of program.statements) {
    if (stmt.kind === 'reset') {
      directives.length = 0
      if (trace) trace.statements.push({ kind: 'reset', source: 'reset directives' })
      continue
    }
    if (stmt.kind === 'directive') {
      directives.push({ allow: stmt.allow, guard: stmt.guard })
      if (trace) trace.statements.push({ kind: 'directive', source: serializeStmt(stmt), allow: stmt.allow })
      continue
    }
    const g = stmt.guard
    const isMove = stmt.action.kind === 'move' || stmt.action.kind === 'morph'
    if (isMove) {
      // The move's own guard is decided PER CANDIDATE inside moveAllowed, so an active `allow` directive
      // can override it (forbid > allow > own guard). Fast path: a guard that neither reads `@target` nor
      // could be overridden by an active `allow` is constant across candidates — decide it once, skipping
      // the whole rule if false (or dropping it, so nothing re-checks it per candidate, if true).
      const inline = g && g.pred.kind === 'inline' ? g.pred.pred : null
      const readsTarget = !!inline && predReadsTarget(inline)
      const hasAllow = directives.some((d) => d.allow)
      let ownGuard: Guard | undefined = g ?? undefined
      if (g && !readsTarget && !hasAllow) {
        const ev = trace ? evalGuardTraced(g, null) : null
        const ok = ev ? ev.result : evalGuard(g, null)
        if (!ok) {
          if (trace && ev) trace.statements.push({ kind: 'gate-skip', source: serializeStmt(stmt), guard: guardEval(g, ev) })
          continue
        }
        ownGuard = undefined
      }
      const candidates: CandidateTrace[] | undefined = trace ? [] : undefined
      applyAction(stmt.action, ownGuard, candidates)
      if (trace)
        trace.statements.push({
          kind: 'move',
          source: serializeStmt(stmt),
          morphDef: stmt.action.kind === 'morph' ? stmt.action.def : undefined,
          candidates: candidates ?? [],
        })
    } else {
      // Non-move rules (put/increase/update): directives don't apply; a guard gates the action up front.
      if (g) {
        const ev = trace ? evalGuardTraced(g, null) : null
        const ok = ev ? ev.result : evalGuard(g, null)
        if (!ok) {
          if (trace && ev) trace.statements.push({ kind: 'gate-skip', source: serializeStmt(stmt), guard: guardEval(g, ev) })
          continue
        }
      }
      applyAction(stmt.action)
      if (trace) trace.statements.push({ kind: stmt.action.kind === 'update' ? 'update' : 'write', source: serializeStmt(stmt) })
    }
  }

  return {
    branches,
    tileWrites,
    next: { maxSplit: self.maxSplit, maxSteps: self.maxSteps, movement: self.movement, p: self.p, q: self.q, r: self.r },
  }
}
