// Move authored seeds + hand-paint between grid sizes. The export grid is its own knob and usually
// much larger than the interactive one (e.g. explore on 40×40, export at 800×800), so a walker pinned
// to tile id `sq:20,20` can't carry over by id — that id means a different place (or nothing) on a
// bigger grid. Instead we use a grid-INDEPENDENT representation: a tile's centroid OFFSET from its
// tiling's bounds-centre. Tiles are unit-edge across every grid size, so the same offset lands on the
// analogous tile at any N (a centred seed stays centred, with more room to grow). Pure & isomorphic.

import type { Tiling, Vec2 } from '../tiling'
import { nodeById, type ShapeType } from '../tiling'
import { pickTile } from '../canvas'

export function boundsCenter(tiling: Tiling): Vec2 {
  const b = tiling.bounds
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

// A tile's centroid relative to its tiling's centre — the portable position stored in metadata.
// Null when the tile id isn't in this tiling.
export function tileOffset(tiling: Tiling, tileId: string): Vec2 | null {
  const node = nodeById(tiling, tileId)
  if (!node) return null
  const c = boundsCenter(tiling)
  return { x: node.centroid.x - c.x, y: node.centroid.y - c.y }
}

// Nearest tile to a world point by centroid distance, optionally restricted to one shape class.
// O(n) — used only as the fallback when the exact pick misses (and for shape-constrained queries),
// and only over a handful of seeds, so the linear scan is fine.
function nearestByCentroid(tiling: Tiling, point: Vec2, shape?: ShapeType): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const node of tiling.nodes) {
    if (shape !== undefined && node.shape !== shape) continue
    const dx = node.centroid.x - point.x
    const dy = node.centroid.y - point.y
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = node.id
    }
  }
  return best
}

// Place a portable offset on `tiling`: the target world point is centre + offset. Try the exact pick
// first (O(1) for the square lattice, spatial-hash otherwise); fall back to nearest-centroid when the
// point lands in a gap/outside or a shape is required and the pick is the wrong class.
export function placeOffset(tiling: Tiling, offset: Vec2, shape?: ShapeType): string | null {
  const c = boundsCenter(tiling)
  const point = { x: c.x + offset.x, y: c.y + offset.y }
  const hit = pickTile(tiling, point)
  if (hit) {
    if (shape === undefined) return hit
    const node = nodeById(tiling, hit)
    if (node && node.shape === shape) return hit
  }
  return nearestByCentroid(tiling, point, shape)
}
