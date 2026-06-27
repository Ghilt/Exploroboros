// Rhombitrihexagonal tiling (3.4.6.4) — regular hexagons pulled apart on a triangular lattice, with
// a square bridging every pair of adjacent hexagons and an equilateral triangle filling each corner
// gap. Around every vertex: hexagon, square, triangle, square. The squares and triangles are emitted
// from each hexagon's edges/corners and deduped by centroid (a square is shared by two hexagons, a
// triangle by three), then welded so stitch pairs the shared edges.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT3 = Math.sqrt(3)
const S = SQRT3 + 1 // hexagon-centre spacing (hex apothem + square + hex apothem)

const HEXAGON = makeShapeDef('hexagon', 6)
const SQUARE = makeShapeDef('square', 4)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (2 * SQRT3 + 3) / 6 // cell area / 6 tiles (1 hexagon + 3 squares + 2 triangles)

const META: TilingMeta = {
  id: 'rhombitrihexagonal',
  name: 'Rhombitrihexagonal',
  vertexConfig: '3.4.6.4',
  chiral: false,
  edgeToEdge: true,
  // Coordinates are keyed to the producing hexagon cell (i, j) plus a class: 0=hexagon,
  // 1..6=the bridging square on hexagon edge k (class = 1 + k), 7..12=the corner triangle at
  // hexagon vertex k (class = 7 + k). Squares/triangles are shared between hexagons but recorded
  // once, by whichever hexagon emits them first — so (i, j, class) stays unique. (Previously the
  // deduped tiles used a rounded centroid, which was opaque and not provably collision-free.)
  latticeLabels: ['i', 'j', 'class'],
}

// Unit outward normal of hexagon edge k (vertex k -> k+1); its midpoint is at angle 60k + 30 deg.
function edgeNormal(k: number): Vec2 {
  const a = (Math.PI / 180) * (60 * k + 30)
  return { x: Math.cos(a), y: Math.sin(a) }
}

type Cand = { id: string; shape: 'hexagon' | 'square' | 'triangle'; lattice: number[]; vertices: Vec2[] }

export function rhombitrihexagonalTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const margin = S
  const iMax = Math.ceil((half + margin) / (S * (SQRT3 / 2))) + 1
  const inRegion = (c: Vec2, lim: number) => c.x >= -lim && c.x <= lim && c.y >= -lim && c.y <= lim
  const key = (c: Vec2) => `${Math.round(c.x / 0.2)},${Math.round(c.y / 0.2)}`

  const kept: Cand[] = []
  const squares = new Map<string, Cand>()
  const tris = new Map<string, Cand>()

  // Hexagon centres on the triangular lattice: e1 at 30 deg, e2 straight up, both length S.
  for (let i = -iMax; i <= iMax; i += 1) {
    const cx = i * S * (SQRT3 / 2)
    const jLo = Math.floor((-half - margin - i * S * 0.5) / S)
    const jHi = Math.ceil((half + margin - i * S * 0.5) / S)
    for (let j = jLo; j <= jHi; j += 1) {
      const center: Vec2 = { x: cx, y: i * S * 0.5 + j * S }
      if (!inRegion(center, half + margin)) continue
      const v = regularPolygonVertices(center, 1, 6, 0)
      if (inRegion(center, half)) {
        kept.push({ id: `hex:${i},${j}`, shape: 'hexagon', lattice: [i, j, 0], vertices: v })
      }
      for (let k = 0; k < 6; k += 1) {
        const nk = edgeNormal(k)
        const a = v[k]
        const b = v[(k + 1) % 6]
        // Square bridging this edge to the neighbouring hexagon.
        const sq = [a, { x: a.x + nk.x, y: a.y + nk.y }, { x: b.x + nk.x, y: b.y + nk.y }, b]
        const sc = centroid(sq)
        const sk = key(sc)
        if (!squares.has(sk)) {
          squares.set(sk, { id: `sq:${sk}`, shape: 'square', lattice: [i, j, 1 + k], vertices: sq })
        }
        // Triangle filling the corner at vertex a, between edges k-1 and k.
        const np = edgeNormal((k + 5) % 6)
        const tri = [a, { x: a.x + np.x, y: a.y + np.y }, { x: a.x + nk.x, y: a.y + nk.y }]
        const tc = centroid(tri)
        const tk = key(tc)
        if (!tris.has(tk)) {
          tris.set(tk, { id: `tri:${tk}`, shape: 'triangle', lattice: [i, j, 7 + k], vertices: tri })
        }
      }
    }
  }

  for (const sq of squares.values()) if (inRegion(centroid(sq.vertices), half)) kept.push(sq)
  for (const tri of tris.values()) if (inRegion(centroid(tri.vertices), half)) kept.push(tri)

  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({ id: t.id, shape: t.shape, lattice: t.lattice, vertices: t.vertices }))
  return stitch(raws, { hexagon: HEXAGON, square: SQUARE, triangle: TRIANGLE }, META)
}
