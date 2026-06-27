// Pure hit-testing: map a world point to the tile under it. No Konva/DOM. The square tiling
// inverts its lattice exactly; any other tiling falls back to a uniform spatial hash +
// point-in-polygon (general and dependency-free — the documented future upgrade is rbush).

import type { Tiling, Vec2 } from '../tiling'
import { nodeById } from '../tiling'

// Ray-cast point-in-polygon (even-odd rule). Vertices in any winding; world coords.
export function pointInPolygon(p: Vec2, verts: ReadonlyArray<Vec2>): boolean {
  let inside = false
  const n = verts.length
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = verts[i]
    const b = verts[j]
    const crosses = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function bbox(verts: ReadonlyArray<Vec2>) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const v of verts) {
    if (v.x < minX) minX = v.x
    if (v.y < minY) minY = v.y
    if (v.x > maxX) maxX = v.x
    if (v.y > maxY) maxY = v.y
  }
  return { minX, minY, maxX, maxY }
}

// A representative tile edge length — sizes spatial-hash cells and stroke sampling. Tiles in
// these tilings are near-uniform, so the first tile's larger bbox dimension is a fine proxy.
export function representativeTileSize(tiling: Tiling): number {
  const node = tiling.nodes[0]
  if (!node) return 1
  const b = bbox(node.vertices)
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY)
  return span > 0 ? span : 1
}

// Uniform-grid bucketing of tiles by world position; query is O(1) average + a few
// point-in-polygon tests on the candidates in the point's cell.
export class SpatialHash {
  private readonly cell: number
  private readonly originX: number
  private readonly originY: number
  private readonly buckets = new Map<string, string[]>()
  private readonly tiling: Tiling

  constructor(tiling: Tiling) {
    this.tiling = tiling
    this.cell = representativeTileSize(tiling)
    this.originX = tiling.bounds.minX
    this.originY = tiling.bounds.minY
    for (const node of tiling.nodes) {
      const b = bbox(node.vertices)
      for (let r = this.row(b.minY); r <= this.row(b.maxY); r += 1) {
        for (let c = this.col(b.minX); c <= this.col(b.maxX); c += 1) {
          const key = `${r},${c}`
          const arr = this.buckets.get(key)
          if (arr) arr.push(node.id)
          else this.buckets.set(key, [node.id])
        }
      }
    }
  }

  private col(x: number): number {
    return Math.floor((x - this.originX) / this.cell)
  }

  private row(y: number): number {
    return Math.floor((y - this.originY) / this.cell)
  }

  pick(p: Vec2): string | null {
    const ids = this.buckets.get(`${this.row(p.y)},${this.col(p.x)}`)
    if (!ids) return null
    for (const id of ids) {
      const node = nodeById(this.tiling, id)
      if (node && pointInPolygon(p, node.vertices)) return id
    }
    return null
  }
}

const hashCache = new WeakMap<Tiling, SpatialHash>()

function spatialHashFor(tiling: Tiling): SpatialHash {
  let h = hashCache.get(tiling)
  if (!h) {
    h = new SpatialHash(tiling)
    hashCache.set(tiling, h)
  }
  return h
}

// Exact pick for the square tiling: invert the lattice. Tile (r,c) spans
// [minX + c*size, minX + (c+1)*size] x [minY + r*size, minY + (r+1)*size]; ids are `sq:r,c`.
function pickSquare(tiling: Tiling, p: Vec2): string | null {
  const size = representativeTileSize(tiling)
  const col = Math.floor((p.x - tiling.bounds.minX) / size)
  const row = Math.floor((p.y - tiling.bounds.minY) / size)
  const id = `sq:${row},${col}`
  return nodeById(tiling, id) ? id : null
}

export function pickTile(tiling: Tiling, p: Vec2): string | null {
  const b = tiling.bounds
  if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return null
  if (tiling.meta.id === 'square') return pickSquare(tiling, p)
  return spatialHashFor(tiling).pick(p)
}

// Tiles whose centroid lies within the world rectangle spanned by `a` and `b` (corners in any
// order) — the box-select query. O(n); runs once per drag release, not per frame.
export function tilesInRect(tiling: Tiling, a: Vec2, b: Vec2): string[] {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  const ids: string[] = []
  for (const node of tiling.nodes) {
    const c = node.centroid
    if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) ids.push(node.id)
  }
  return ids
}
