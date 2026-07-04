// Pure geometry for the Initial-state DSL's placement shapes — isomorphic (no React/DOM/Konva), so it
// runs in the live preview, the export worker, and Vitest identically. Resolved against WHATEVER tiling
// is passed, so a shape scales with the grid (the whole point vs a hand-placed absolute-offset seed).

import type { Tiling, TileNode, Vec2 } from '../tiling'
import { nodeById, uniqueNeighbors } from '../tiling'

const clampPct = (p: number) => Math.max(0, Math.min(100, p))

// The tiles a line at `angleDeg` (0 = row/horizontal, 90 = column/vertical) and `percent` across the
// plane passes through. `percent` is measured perpendicular to the line from the TOP-LEFT extreme:
// 0 = the top (for a row) / left (for a column) edge, 100 = the opposite. A tile is "on the line" when
// its vertices straddle it (the infinite line passes through the polygon), so a horizontal line picks
// exactly the row at that height and a diagonal picks the staircase it crosses — correct on convex,
// concave and chiral tiles.
export function lineTiles(tiling: Tiling, angleDeg: number, percent: number): TileNode[] {
  const rad = (angleDeg * Math.PI) / 180
  // Normal to the line = the line direction rotated +90°. For 0° (horizontal) n = (0, 1) → offset in
  // world y (0% = max y = top); for 90° (vertical) n = (-1, 0) → offset in -x (0% = min x = left).
  // y-up world. Snap a hair-off component to 0 (cos(90°) is 6e-17, not 0) so an axis-aligned line stays
  // axis-aligned — otherwise the tiny tilt makes only the extreme-corner tile straddle the 0%/100% line.
  const snap = (x: number) => (Math.abs(x) < 1e-9 ? 0 : x)
  const n: Vec2 = { x: snap(-Math.sin(rad)), y: snap(Math.cos(rad)) }
  const b = tiling.bounds
  const corners: Vec2[] = [
    { x: b.minX, y: b.minY },
    { x: b.minX, y: b.maxY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
  ]
  let cmin = Infinity
  let cmax = -Infinity
  for (const p of corners) {
    const d = p.x * n.x + p.y * n.y
    if (d < cmin) cmin = d
    if (d > cmax) cmax = d
  }
  // percent 0 → cmax (the top-left extreme), 100 → cmin (the bottom-right).
  const c = cmax - (clampPct(percent) / 100) * (cmax - cmin)
  const out: TileNode[] = []
  for (const node of tiling.nodes) {
    let lo = Infinity
    let hi = -Infinity
    for (const v of node.vertices) {
      const d = v.x * n.x + v.y * n.y - c
      if (d < lo) lo = d
      if (d > hi) hi = d
    }
    if (lo <= 0 && hi >= 0) out.push(node)
  }
  return out
}

// The tiles of a `blob`: the tile whose centroid is nearest the point (x%,y% from the TOP-LEFT — world
// is y-up so 0% y = the top = max y), then BFS out `radius - 1` rings over the neighbour graph. radius
// <= 1 → just that one tile; radius 2 → it + its direct neighbours; and so on. Contiguous and
// tiling-agnostic (a two-edge neighbour counts once via uniqueNeighbors).
export function blobTiles(tiling: Tiling, xPct: number, yPct: number, radius: number): TileNode[] {
  const b = tiling.bounds
  const px = b.minX + (clampPct(xPct) / 100) * (b.maxX - b.minX)
  const py = b.maxY - (clampPct(yPct) / 100) * (b.maxY - b.minY)
  let start: TileNode | null = null
  let best = Infinity
  for (const node of tiling.nodes) {
    const dx = node.centroid.x - px
    const dy = node.centroid.y - py
    const d = dx * dx + dy * dy
    if (d < best) {
      best = d
      start = node
    }
  }
  if (!start) return []
  const out: TileNode[] = [start]
  const r = Math.max(1, Math.round(radius))
  if (r <= 1) return out
  const seen = new Set<string>([start.id])
  let frontier: string[] = [start.id]
  for (let ring = 1; ring < r; ring += 1) {
    const nextF: string[] = []
    for (const id of frontier) {
      for (const nb of uniqueNeighbors(tiling, id)) {
        if (seen.has(nb)) continue
        seen.add(nb)
        nextF.push(nb)
        const node = nodeById(tiling, nb)
        if (node) out.push(node)
      }
    }
    frontier = nextF
  }
  return out
}
