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
