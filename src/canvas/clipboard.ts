// Pure copy/paste of tile attributes. Today the only attribute is the visited count; the
// shape of TileAttrs is the extension point for future per-tile attributes (colour, seed...).
// Paste only applies between "similar" tiles (same shape class).

import type { ShapeType } from '../tiling'

export type TileAttrs = { visited: number }
export type TileClip = { shape: ShapeType; attrs: TileAttrs }

export function clipFromTile(shape: ShapeType, visited: number): TileClip {
  return { shape, attrs: { visited } }
}

// Two tiles are "similar" (paste-compatible) when they share a shape class. A type guard so a
// successful check narrows the clip to non-null at the call site.
export function canPaste(clip: TileClip | null, targetShape: ShapeType): clip is TileClip {
  return clip !== null && clip.shape === targetShape
}

// Paste replaces the target tile's attributes. Returns a new visited overlay (the input map is
// not mutated), so it slots straight into React state.
export function applyClip(
  visited: ReadonlyMap<string, number>,
  targetId: string,
  clip: TileClip,
): Map<string, number> {
  const next = new Map(visited)
  next.set(targetId, clip.attrs.visited)
  return next
}
