// The synchronous tick, DSL-driven: each walker runs its definition's compiled program against the
// FROZEN overlay (read all, then write all), producing branches + tile-registry writes. Branches are
// coalesced (identical state merges — the anti-blowup rule), tile writes + visits are applied, over-age
// walkers (max-steps) are dropped, and the step counter advances. `heading` is an edge NUMBER
// throughout (see edges.ts); rotateHeading serves the Inspect aim controls.

import type { Tiling } from '../tiling'
import { nodeById } from '../tiling'
import { addVisits, applyRegistryWrites, EMPTY_TILE_STATE, type TileState, type RegWrite } from '../canvas'
import { makeMatchAt, maintainFindExtreme, runProgram, type TileWrite, type WalkerState } from './lang'
import type { Traverser, TraverseState, TickResult } from './types'
import type { TickTrace, TraverserTrace } from './trace'

// The next heading when the user rotates a placed head: one edge clockwise (dir +1, "turn right") or
// counter-clockwise (dir -1). Heading is an edge number, so it is plain ring arithmetic — the same
// step `r1`/`l1` take. Returns `heading` unchanged for a tile with no edges / unknown id.
export function rotateHeading(tiling: Tiling, tile: string, heading: number, dir: 1 | -1): number {
  const node = nodeById(tiling, tile)
  const n = node?.sides.length ?? 0
  if (n === 0) return heading
  return (((heading + dir) % n) + n) % n
}

// After a traverser DEFINITION is renamed, any walker already placed with the old name would silently
// stop resolving (`defs.get(tr.def)` in computeTick misses -> dropped next tick, per below). Rewrite
// `def` on every walker that used an old name to its new one; walkers using other names pass through
// unchanged. Mirrors the seed-def rewrite the v4->v5 recipe migration does for the load-from-PNG path.
export function renameSeedDefs(list: ReadonlyArray<Traverser>, renamed: ReadonlyMap<string, string>): Traverser[] {
  if (renamed.size === 0) return [...list]
  return list.map((t) => {
    const next = renamed.get(t.def)
    return next === undefined ? t : { ...t, def: next }
  })
}

// The decisions of one tick, WITHOUT touching the overlay: each walker runs its program off the
// frozen overlay; a walker that produces no move/morph is dropped (it only persists by moving).
// Branches inherit the parent's registers/steps (branch 0 keeps the id, extras get fresh ids; splits++
// on a real split). Identical branches — same def, tile, heading and P/Q/R — coalesce to bound
// branching; over-age walkers (max-steps) drop. Returns the surviving walkers plus the writes to
// apply (registry writes in order, then one visit per destination tile at `nextStep`). Both
// stepTraversers (immutable) and stepTraversersInto (mutable) build on this, so their decisions match.
type TickCore = { next: Traverser[]; tileWrites: RegWrite[]; destinations: string[]; nextStep: number }

function computeTick(state: TraverseState, sink?: TickTrace): TickCore {
  const { tiling, overlay, traversers, step, defs, indexById } = state
  const nextStep = step + 1
  // `.tile N` addresses by the user-facing numbering (the scheme order), NOT raw generation order —
  // absent (a test path that supplies no scheme) it falls back to generation order.
  const tileByIndex = state.numbering?.order ?? tiling.nodes.map((n) => n.id)

  const spawned: Traverser[] = []
  const tileWrites: RegWrite[] = []
  for (const tr of traversers) {
    const program = defs.get(tr.def)
    if (!program) {
      // unknown definition -> can't act -> drop. Still trace it so the log can say "unknown def".
      if (sink) sink.traversers.push(traceHeader(tiling, tr, true))
      continue
    }
    const walker: WalkerState = {
      tile: tr.tile,
      heading: tr.heading,
      steps: tr.steps,
      splits: tr.splits,
      maxSplit: tr.maxSplit,
      maxSteps: tr.maxSteps,
      movement: tr.movement,
      p: tr.p,
      q: tr.q,
      r: tr.r,
    }
    const trTrace = sink ? traceHeader(tiling, tr, false) : undefined
    const res = runProgram(
      { tiling, overlay, indexById, tileByIndex, walker, program, numbering: state.numbering, step, findLowestCache: state.findLowestCache },
      trTrace,
    )
    if (trTrace) {
      trTrace.branches = res.branches.map((b) => ({ tile: b.tile, heading: b.heading, morphDef: b.morphDef }))
      sink!.traversers.push(trTrace)
    }
    for (const w of res.tileWrites as TileWrite[]) tileWrites.push(w)
    const split = res.branches.length > 1
    res.branches.forEach((b, i) => {
      spawned.push({
        id: i === 0 ? tr.id : `${tr.id}.${i}`,
        tile: b.tile,
        heading: b.heading,
        def: b.morphDef ?? tr.def,
        steps: tr.steps + 1,
        splits: tr.splits + (split ? 1 : 0),
        maxSplit: res.next.maxSplit,
        maxSteps: res.next.maxSteps,
        movement: res.next.movement,
        p: res.next.p,
        q: res.next.q,
        r: res.next.r,
      })
    })
  }

  // Coalesce identical branches; then drop walkers past their max-steps. (`seen` is a Map only so the
  // trace can name the survivor a merged branch folded into — the dedup decisions are unchanged.)
  const seen = new Map<string, string>()
  const next: Traverser[] = []
  for (const b of spawned) {
    const key = `${b.def}|${b.tile}|${b.heading}|${b.p}|${b.q}|${b.r}`
    const survivor = seen.get(key)
    if (survivor !== undefined) {
      if (sink) sink.coalesced.push({ key, survivorId: survivor, mergedId: b.id })
      continue
    }
    seen.set(key, b.id)
    if (b.steps > b.maxSteps) {
      if (sink) sink.dropped.push({ id: b.id, steps: b.steps, maxSteps: b.maxSteps })
      continue
    }
    next.push(b)
  }

  const destinations = [...new Set(next.map((b) => b.tile))]
  if (sink) {
    sink.step = step
    sink.nextStep = nextStep
    sink.destinations = destinations
  }
  return { next, tileWrites, destinations, nextStep }
}

// A trace header snapshot of a walker's tick-start state (the statements/branches are filled by
// runProgram / the caller). Only built when tracing.
function traceHeader(tiling: Tiling, tr: Traverser, missingDef: boolean): TraverserTrace {
  return {
    id: tr.id,
    def: tr.def,
    tile: tr.tile,
    tileType: nodeById(tiling, tr.tile)?.shape ?? '?',
    heading: tr.heading,
    movement: tr.movement,
    steps: tr.steps,
    splits: tr.splits,
    p: tr.p,
    q: tr.q,
    r: tr.r,
    ...(missingDef ? { missingDef: true } : {}),
    statements: [],
    branches: [],
  }
}

// After a tick's writes are applied, advance the find-lowest/highest bookmarks against the NEW overlay so
// the next tick's search resumes instead of rescanning. A no-op unless the run supplied a numbering + a
// cache (the ONLY correctness coupling between the immutable live tick and the in-place export tick — both
// call this so they can't drift). `written` = the tiles this tick visited or registry-wrote.
function maintainFindCache(state: TraverseState, newOverlay: ReadonlyMap<string, TileState>, core: TickCore): void {
  const { numbering, findLowestCache } = state
  if (!numbering || !findLowestCache) return
  const written = new Set<string>(core.destinations)
  for (const w of core.tileWrites) written.add(w.tile)
  maintainFindExtreme(
    state.tiling,
    numbering.order,
    numbering.posOf,
    written,
    findLowestCache,
    core.nextStep,
    makeMatchAt(state.tiling, newOverlay, state.indexById, numbering.order),
  )
}

// Advance one tick, returning a FRESH overlay (the immutable form the live React run uses).
export function stepTraversers(state: TraverseState): TickResult {
  const core = computeTick(state)
  let nextOverlay = applyRegistryWrites(state.overlay, core.tileWrites)
  nextOverlay = addVisits(nextOverlay, core.destinations, core.nextStep)
  maintainFindCache(state, nextOverlay, core)
  return { overlay: nextOverlay, traversers: core.next, step: core.nextStep }
}

// Same as stepTraversers, but ALSO returns a per-tick decision TRACE (the debug log's data). The
// debug-mode path the live run uses when the user is stepping with the log open; the trace adds work
// only here — plain stepTraversers / the export run never build it.
export function stepTraversersTraced(state: TraverseState): TickResult & { trace: TickTrace } {
  const trace: TickTrace = {
    step: state.step,
    nextStep: state.step + 1,
    traversers: [],
    coalesced: [],
    dropped: [],
    destinations: [],
  }
  const core = computeTick(state, trace)
  let nextOverlay = applyRegistryWrites(state.overlay, core.tileWrites)
  nextOverlay = addVisits(nextOverlay, core.destinations, core.nextStep)
  maintainFindCache(state, nextOverlay, core)
  return { overlay: nextOverlay, traversers: core.next, step: core.nextStep, trace }
}

// Advance one tick, applying the writes INTO `overlay` in place (no per-tick copy). Same decisions as
// stepTraversers — `state.overlay` must be this same Map, read fully (in computeTick) before any write.
// For the headless export run, where copying a growing overlay every tick would be O(ticks × visited)
// on a big grid; in place it's O(work). The live run keeps using the immutable stepTraversers.
export function stepTraversersInto(
  state: TraverseState,
  overlay: Map<string, TileState>,
): { traversers: Traverser[]; step: number } {
  const core = computeTick(state)
  // Registry writes first (set = last-writer-wins, add accumulates), then one visit per destination —
  // the same order as applyRegistryWrites + addVisits, but mutating the shared Map.
  for (const w of core.tileWrites) {
    const prev = overlay.get(w.tile) ?? EMPTY_TILE_STATE
    overlay.set(w.tile, { ...prev, [w.reg]: w.op === 'set' ? w.value : prev[w.reg] + w.value })
  }
  for (const id of core.destinations) {
    const prev = overlay.get(id) ?? EMPTY_TILE_STATE
    overlay.set(id, { ...prev, visits: [...prev.visits, core.nextStep] })
  }
  maintainFindCache(state, overlay, core)
  return { traversers: core.next, step: core.nextStep }
}
