// Pure stroke helper for drag-paint: fill the gaps between sparse pointer samples so a fast
// drag paints a continuous trail of tiles instead of dotted hits. The per-stroke dedupe of
// already-painted tiles lives in the renderer (a Set owned by the active stroke).

import type { Tiling, Vec2 } from '../tiling'
import { pickTile, representativeTileSize } from './pick'

// Tile ids crossed by the world-space segment a->b, in order, with consecutive duplicates
// removed. Samples at ~half a tile so no tile between the endpoints is skipped; samples that
// miss a tile (null) are dropped.
export function tilesAlongSegment(tiling: Tiling, a: Vec2, b: Vec2): string[] {
  const step = Math.max(representativeTileSize(tiling) / 2, 1e-9)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step))
  const out: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const id = pickTile(tiling, { x: a.x + dx * t, y: a.y + dy * t })
    if (id && out[out.length - 1] !== id) out.push(id)
  }
  return out
}
