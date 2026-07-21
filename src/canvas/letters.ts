import type { TileNode } from '../tiling'

// The radius (world units) of the largest circle centred on the tile's centroid that still fits inside
// it: the min perpendicular distance from the centroid to any edge. Used to size a letter so it stays
// framed inside tiles of very different sizes (a small triangle next to a big dodecagon) without
// overflowing. A concave tile (the kalleboda wedge) just gets a conservatively small radius, which is
// fine — the letter shrinks rather than spilling out.
export function inscribedRadius(node: TileNode): number {
  const c = node.centroid
  const v = node.vertices
  let min = Infinity
  for (let i = 0; i < v.length; i += 1) {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    // |cross(b-a, a-c)| / |b-a| — perpendicular distance from c to the line through a,b.
    const dist = Math.abs(dx * (a.y - c.y) - dy * (a.x - c.x)) / len
    if (dist < min) min = dist
  }
  return Number.isFinite(min) ? min : 0
}
