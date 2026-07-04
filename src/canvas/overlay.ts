// Per-tile run state — the mutable overlay kept OFF the immutable Tiling and keyed by tile id
// (CLAUDE.md §4.3). The traverser DSL (future) reads/writes this each tick; painting and the
// Inspect dock edit it by hand. Pure: no React/DOM/Konva. Every updater returns a fresh Map so it
// drops straight into React state.

export type TileState = {
  // The steps (ticks) at which this tile was visited, in the order they happened — an append-only
  // log, so the visit COUNT is simply visits.length. Hand-made visits (paint / Inspect +) use -1.
  visits: ReadonlyArray<number>
  // Three free-form per-tile counters the player drives however they like from traverser rules.
  a: number
  b: number
  c: number
}

export type Registry = 'a' | 'b' | 'c'
export type PaintTarget = 'visited' | Registry

// Step stamped on a hand-made visit. Real traverser visits carry their tick number; -1 means "by
// hand, outside any run".
export const MANUAL_STEP = -1

// Shared blank state — frozen so the singleton can't be mutated through an aliased read.
export const EMPTY_TILE_STATE: TileState = Object.freeze({
  visits: Object.freeze<number[]>([]),
  a: 0,
  b: 0,
  c: 0,
})

export function tileState(overlay: ReadonlyMap<string, TileState>, id: string): TileState {
  return overlay.get(id) ?? EMPTY_TILE_STATE
}

export function visitCount(state: TileState): number {
  return state.visits.length
}

// True when no tile carries any visit or non-zero counter — a blank plane (drives Reset's disabled
// state and the tiling-switch "is there anything to clear" check).
export function overlayIsEmpty(overlay: ReadonlyMap<string, TileState>): boolean {
  for (const s of overlay.values()) {
    if (s.visits.length > 0 || s.a !== 0 || s.b !== 0 || s.c !== 0) return false
  }
  return true
}

// Append a visit at `step` to one tile.
export function addVisit(
  overlay: ReadonlyMap<string, TileState>,
  id: string,
  step: number = MANUAL_STEP,
): Map<string, TileState> {
  const next = new Map(overlay)
  const prev = next.get(id) ?? EMPTY_TILE_STATE
  next.set(id, { ...prev, visits: [...prev.visits, step] })
  return next
}

// Undo one hand-made visit: drop the most recent step -1 entry, leaving any traverser-recorded
// steps intact. No-op when the tile has no manual visit (the Inspect − only ever removes what a
// person added by hand).
export function removeManualVisit(
  overlay: ReadonlyMap<string, TileState>,
  id: string,
): Map<string, TileState> {
  const prev = overlay.get(id)
  const next = new Map(overlay)
  if (!prev) return next
  const idx = prev.visits.lastIndexOf(MANUAL_STEP)
  if (idx === -1) return next
  next.set(id, { ...prev, visits: [...prev.visits.slice(0, idx), ...prev.visits.slice(idx + 1)] })
  return next
}

// Nudge one registry, clamped at >= 0 for the manual steppers (a traverser rule may set any value
// later).
export function bumpRegistry(
  overlay: ReadonlyMap<string, TileState>,
  id: string,
  reg: Registry,
  delta: number,
): Map<string, TileState> {
  const next = new Map(overlay)
  const prev = next.get(id) ?? EMPTY_TILE_STATE
  next.set(id, { ...prev, [reg]: Math.max(0, prev[reg] + delta) })
  return next
}

// One paint stroke over many tiles: a visited stroke appends a step -1 visit to each; a registry
// stroke bumps that counter by +1 on each. The canvas dedupes tiles within a stroke.
export function applyPaint(
  overlay: ReadonlyMap<string, TileState>,
  ids: ReadonlyArray<string>,
  target: PaintTarget,
): Map<string, TileState> {
  const next = new Map(overlay)
  if (ids.length === 0) return next
  for (const id of ids) {
    const prev = next.get(id) ?? EMPTY_TILE_STATE
    if (target === 'visited') {
      next.set(id, { ...prev, visits: [...prev.visits, MANUAL_STEP] })
    } else {
      next.set(id, { ...prev, [target]: prev[target] + 1 })
    }
  }
  return next
}

// A registry write from a traverser rule: set an absolute value, or add a delta. Applied in array
// order within a tick: `add` (from `increase`) accumulates order-independently, while `set` (from
// `put`) is last-writer-wins — so co-located walkers combine cleanly with `increase` but a conflicting
// `put` resolves to the last writer. Unlike the manual stepper (bumpRegistry) these are NOT clamped —
// a rule may compute any value, including negatives.
export type RegWrite = { tile: string; reg: Registry; op: 'set' | 'add'; value: number }

export function applyRegistryWrites(
  overlay: ReadonlyMap<string, TileState>,
  writes: ReadonlyArray<RegWrite>,
): Map<string, TileState> {
  const next = new Map(overlay)
  for (const w of writes) {
    const prev = next.get(w.tile) ?? EMPTY_TILE_STATE
    next.set(w.tile, { ...prev, [w.reg]: w.op === 'set' ? w.value : prev[w.reg] + w.value })
  }
  return next
}

// Replace a tile's visit log with `count` hand-made (MANUAL_STEP) visits — the Initial-state DSL's
// `visited` set-write. Overwrites any existing visits on that tile (init "set" wins over hand-paint);
// the A/B/C registries are left untouched. `count` is clamped to >= 0 (the resolver passes >= 1).
export function setVisits(
  overlay: ReadonlyMap<string, TileState>,
  id: string,
  count: number,
): Map<string, TileState> {
  const next = new Map(overlay)
  const prev = next.get(id) ?? EMPTY_TILE_STATE
  const n = Math.max(0, Math.round(count))
  next.set(id, { ...prev, visits: new Array<number>(n).fill(MANUAL_STEP) })
  return next
}

// Append a visit stamped with a real tick `step` to each given tile in one pass — the traverser
// tick's batch write (mirrors applyPaint's visited stroke, but a real step instead of MANUAL_STEP).
export function addVisits(
  overlay: ReadonlyMap<string, TileState>,
  ids: ReadonlyArray<string>,
  step: number,
): Map<string, TileState> {
  const next = new Map(overlay)
  for (const id of ids) {
    const prev = next.get(id) ?? EMPTY_TILE_STATE
    next.set(id, { ...prev, visits: [...prev.visits, step] })
  }
  return next
}

// Drop every traverser-made visit (step >= 0) while keeping hand-made ones (MANUAL_STEP) and the
// A/B/C registries — what Stop uses to end a run without wiping the painted board. Tiles left with
// nothing at all are removed so the overlay stays tidy (and overlayIsEmpty can go back to true).
export function clearTraverserVisits(overlay: ReadonlyMap<string, TileState>): Map<string, TileState> {
  const next = new Map<string, TileState>()
  for (const [id, s] of overlay) {
    const hasReal = s.visits.some((step) => step >= 0)
    const kept = hasReal ? s.visits.filter((step) => step < 0) : s.visits
    if (kept.length === 0 && s.a === 0 && s.b === 0 && s.c === 0) continue // fully empty -> drop
    next.set(id, hasReal ? { ...s, visits: kept } : s)
  }
  return next
}

// Revert every tile's A/B/C to its authored (pre-run) value — the registry counterpart of
// clearTraverserVisits. Registries carry no per-write stamp (unlike visits, where step -1 marks a
// hand-made one), so Stop can't tell a run's registry write from a hand-set value after the fact;
// instead it passes the overlay snapshot taken when the run started (`authored`), and this reverts the
// run's writes while keeping any hand-set registries intact. Visits are left untouched (handled by
// clearTraverserVisits). Tiles left fully empty are dropped so the overlay stays tidy.
export function restoreRegistries(
  overlay: ReadonlyMap<string, TileState>,
  authored: ReadonlyMap<string, TileState>,
): Map<string, TileState> {
  const next = new Map<string, TileState>()
  for (const [id, s] of overlay) {
    const a = authored.get(id)?.a ?? 0
    const b = authored.get(id)?.b ?? 0
    const c = authored.get(id)?.c ?? 0
    if (s.visits.length === 0 && a === 0 && b === 0 && c === 0) continue // nothing left -> drop
    next.set(id, s.a === a && s.b === b && s.c === c ? s : { ...s, a, b, c })
  }
  return next
}

// The authored board — hand-set state only, with any in-progress run's writes undone. This is exactly
// what Stop restores, and what an EXPORT must capture (so a saved recipe holds only the authored base;
// the traverser's own writes are re-derived by re-running). Visits carry a per-tick stamp, so
// clearTraverserVisits drops the run's; A/B/C do NOT, so while a run is live (incl. auto-paused, when
// the finished board still sits in the overlay) we revert them against the pre-run snapshot too —
// otherwise a traverser's registry writes bake into the recipe as if hand-painted. With no run live the
// overlay is already the authored board (Stop reverted it), so `authored` is unused. Keep Stop and the
// export path both routed through here so they can never drift apart (that drift WAS a bug: an export
// after a run baked the run's A/B/C into the recipe as spurious hand-set values).
export function authoredBoard(
  overlay: ReadonlyMap<string, TileState>,
  runActive: boolean,
  authored: ReadonlyMap<string, TileState>,
): Map<string, TileState> {
  return clearTraverserVisits(runActive ? restoreRegistries(overlay, authored) : overlay)
}

// True when any tile carries a traverser-made visit (step >= 0) — drives Stop's enabled state, the
// way overlayIsEmpty drives the full Reset's.
export function hasTraverserVisits(overlay: ReadonlyMap<string, TileState>): boolean {
  for (const s of overlay.values()) {
    for (const step of s.visits) if (step >= 0) return true
  }
  return false
}
