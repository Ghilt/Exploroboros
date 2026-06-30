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

import type { Tiling } from '../../tiling'
import { nodeById } from '../../tiling'
import { evalNumber, evalPredicate, type EvalContext } from '../../dsl'
import type { TileState } from '../../canvas'
import { resolveChain, resolveRef } from './edges'
import { serializeChain, serializeGuard, serializeStmt } from './serialize'
import type { Action, Decoration, DExpr, EdgeTarget, Guard, Movement, Program } from './types'
import type { CandidateTrace, GuardEval, RejectReason, TraverserTrace } from '../trace'

export type WalkerState = {
  tile: string
  heading: number // radians
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

const TWO_PI = Math.PI * 2
const radToDeg = (rad: number) => ((((rad * 180) / Math.PI) % 360) + 360) % 360
const degToRad = (deg: number) => (deg * Math.PI) / 180

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

  // The walker attributes the DSL sees (heading in degrees). Rebuilt each read so it reflects mutations.
  const traverserAttrs = () => ({
    steps: walker.steps,
    splits: walker.splits,
    heading: radToDeg(self.heading),
    p: self.p,
    q: self.q,
    r: self.r,
  })
  const ctxFor = (tileId: string): EvalContext | null => {
    const node = nodeById(tiling, tileId)
    return node ? { node, tiling, overlay, indexById, traverser: traverserAttrs() } : null
  }
  // The tile a decoration points at, or null if it doesn't exist. No decoration -> the current tile.
  // `@ target` -> the move destination under consideration (`dest`); outside a move context (dest
  // null) it falls back to the current tile, so a stray `@ target` is never silently always-false.
  const decoratedTile = (at: Decoration | undefined, dest: string | null): string | null => {
    if (!at) return walker.tile
    if (at.kind === 'target') return dest ?? walker.tile
    if (at.kind === 'tile') return tileByIndex[at.index] ?? null
    return resolveRef(tiling, overlay, walker.tile, self.heading, self.movement, at.edge)?.tile ?? null
  }

  // The guard's boolean AND the tile it read. tileId is computed regardless, so returning it costs
  // nothing and gives the trace the "which tile did this guard test" answer.
  const evalGuardFull = (guard: Guard, dest: string | null): { result: boolean; tileId: string | null } => {
    const tileId = decoratedTile(guard.at, dest)
    if (tileId === null) return { result: false, tileId: null } // boundary / missing -> false
    const ctx = ctxFor(tileId)
    if (!ctx || guard.pred.kind === 'named') return { result: false, tileId } // named resolved at compile
    return { result: evalPredicate(guard.pred.pred, ctx), tileId }
  }
  const evalGuard = (guard: Guard, dest: string | null): boolean => evalGuardFull(guard, dest).result
  // Package a guard evaluation for the trace — only called under `if (trace)`, so the text
  // serialization never runs on the hot path.
  const guardEval = (guard: Guard, full: { result: boolean; tileId: string | null }): GuardEval => ({
    text: serializeGuard(guard),
    tileId: full.tileId,
    tileType: full.tileId ? nodeById(tiling, full.tileId)?.shape ?? null : null,
    decorated: guard.at !== undefined,
    result: full.result,
    reason: full.tileId === null ? 'boundary' : guard.pred.kind === 'named' ? 'named-unresolved' : undefined,
  })
  const evalDExpr = (d: DExpr): number => {
    const tileId = decoratedTile(d.at, null)
    if (tileId === null) return 0
    const ctx = ctxFor(tileId)
    return ctx ? evalNumber(d.expr, ctx) : 0
  }

  // A candidate destination passes if it clears the rule's own per-target guard (if any) and every
  // active directive: each `allow` guard true AND no `forbid` guard true (forbid wins). Each guard's
  // predicate reads the current tile unless it carries `@ target`, which points it at `dest`.
  const moveAllowed = (dest: string, perTarget?: Guard): boolean => {
    if (perTarget && !evalGuard(perTarget, dest)) return false
    for (const d of directives) {
      const g = evalGuard(d.guard, dest)
      if (d.allow ? !g : g) return false
    }
    return true
  }
  // The same verdict as moveAllowed, but reporting the FIRST blocker (same evaluation order) for the
  // trace. Used only when recording.
  const moveAllowedTraced = (dest: string, perTarget?: Guard): { ok: boolean; reject?: RejectReason } => {
    if (perTarget) {
      const full = evalGuardFull(perTarget, dest)
      if (!full.result) return { ok: false, reject: { by: 'per-target', guard: guardEval(perTarget, full) } }
    }
    for (let i = 0; i < directives.length; i += 1) {
      const d = directives[i]
      const full = evalGuardFull(d.guard, dest)
      if (d.allow ? !full.result : full.result)
        return { ok: false, reject: { by: 'directive', index: i, allow: d.allow, guard: guardEval(d.guard, full) } }
    }
    return { ok: true }
  }

  const addMoves = (target: EdgeTarget, perTarget?: Guard, morphDef?: string, record?: CandidateTrace[]) => {
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
        const v = moveAllowedTraced(hop.tile, perTarget)
        record.push({ chainText: serializeChain(chain), dest: hop.tile, destType: nodeById(tiling, hop.tile)?.shape ?? null, heading: hop.heading, survived: v.ok, reject: v.reject })
        if (!v.ok) continue
      } else if (!moveAllowed(hop.tile, perTarget)) {
        continue
      }
      branches.push({ tile: hop.tile, heading: hop.heading, morphDef })
    }
  }

  const applyAction = (a: Action, perTarget?: Guard, record?: CandidateTrace[]) => {
    switch (a.kind) {
      case 'move':
        addMoves(a.target, perTarget, undefined, record)
        return
      case 'morph':
        addMoves(a.target, perTarget, a.def, record)
        return
      case 'put': {
        const v = evalDExpr(a.value)
        if (a.reg === 'A' || a.reg === 'B' || a.reg === 'C') {
          tileWrites.push({ tile: walker.tile, reg: a.reg.toLowerCase() as 'a' | 'b' | 'c', op: 'set', value: v })
        } else if (a.reg === 'P') self.p = v
        else if (a.reg === 'Q') self.q = v
        else self.r = v
        return
      }
      case 'increase': {
        const by = evalDExpr(a.by)
        if (a.reg === 'A' || a.reg === 'B' || a.reg === 'C') {
          tileWrites.push({ tile: walker.tile, reg: a.reg.toLowerCase() as 'a' | 'b' | 'c', op: 'add', value: by })
        } else if (a.reg === 'P') self.p += by
        else if (a.reg === 'Q') self.q += by
        else self.r += by
        return
      }
      case 'update':
        if (a.setting === 'max-split') self.maxSplit = Math.max(0, Math.round(a.value as number))
        else if (a.setting === 'max-steps') self.maxSteps = Math.max(1, Math.round(a.value as number))
        else if (a.setting === 'heading') self.heading = ((degToRad(a.value as number) % TWO_PI) + TWO_PI) % TWO_PI
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
    // A `@ target` guard on a move/morph filters each candidate destination (like an inline directive);
    // any other guard gates the whole statement up front against the current/decorated tile.
    const g = stmt.guard
    const isMove = stmt.action.kind === 'move' || stmt.action.kind === 'morph'
    const perTarget = !!g && g.at?.kind === 'target' && isMove
    if (g && !perTarget) {
      const full = evalGuardFull(g, null)
      if (!full.result) {
        if (trace) trace.statements.push({ kind: 'gate-skip', source: serializeStmt(stmt), guard: guardEval(g, full) })
        continue
      }
    }
    if (isMove) {
      const candidates: CandidateTrace[] | undefined = trace ? [] : undefined
      applyAction(stmt.action, perTarget ? g : undefined, candidates)
      if (trace)
        trace.statements.push({
          kind: 'move',
          source: serializeStmt(stmt),
          morphDef: stmt.action.kind === 'morph' ? stmt.action.def : undefined,
          candidates: candidates ?? [],
        })
    } else {
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
