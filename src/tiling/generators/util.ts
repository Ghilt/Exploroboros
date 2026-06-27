// Shared helpers for tiling generators.

import type { Vec2 } from '../types'

// Snap coincident vertices to a single shared point so that endpoint keys match exactly across
// tiles — letting the generic stitch() pair shared edges even when trig-based coordinates differ
// by floating-point noise. Proximity-based (checks neighbouring grid cells), so it's robust to
// points that straddle a quantization boundary. `eps` must sit comfortably between the largest
// expected coincidence error and the smallest gap between genuinely distinct vertices. Mutates
// each tile's `vertices` in place.
export function weldVertices(tiles: ReadonlyArray<{ vertices: Vec2[] }>, eps: number): void {
  const canon: Vec2[] = []
  const grid = new Map<string, number[]>()
  const canonical = (p: Vec2): Vec2 => {
    const cx = Math.floor(p.x / eps)
    const cy = Math.floor(p.y / eps)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const idxs = grid.get(`${cx + dx},${cy + dy}`)
        if (!idxs) continue
        for (const i of idxs) {
          const q = canon[i]
          if (Math.hypot(q.x - p.x, q.y - p.y) <= eps) return q
        }
      }
    }
    const idx = canon.length
    canon.push(p)
    const key = `${cx},${cy}`
    const b = grid.get(key)
    if (b) b.push(idx)
    else grid.set(key, [idx])
    return p
  }
  for (const t of tiles) t.vertices = t.vertices.map(canonical)
}
