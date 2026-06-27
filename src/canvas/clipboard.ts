// Pure copy/paste of tile attributes — the whole per-tile run state (the visit log + the A/B/C
// registries). Paste only applies between "similar" tiles (same shape class).

import type { ShapeType } from '../tiling'
import type { TileState } from './overlay'

export type TileClip = { shape: ShapeType; state: TileState }

// Snapshot the tile's state so a later edit to the live overlay can't reach back into the clipboard.
export function clipFromTile(shape: ShapeType, state: TileState): TileClip {
  return { shape, state: { ...state, visits: [...state.visits] } }
}

// Two tiles are "similar" (paste-compatible) when they share a shape class. A type guard so a
// successful check narrows the clip to non-null at the call site.
export function canPaste(clip: TileClip | null, targetShape: ShapeType): clip is TileClip {
  return clip !== null && clip.shape === targetShape
}

// Paste replaces the target tile's state with a fresh copy of the clip's (so pasting twice doesn't
// alias the visit list). Returns a new overlay; the input map is untouched.
export function applyClip(
  overlay: ReadonlyMap<string, TileState>,
  targetId: string,
  clip: TileClip,
): Map<string, TileState> {
  const next = new Map(overlay)
  next.set(targetId, { ...clip.state, visits: [...clip.state.visits] })
  return next
}
