// 3.4.6.12 tiling — a "diminished" rhombitrihexagonal (3.4.6.4): its hexagons sit on a triangular
// lattice, and one hexagon in every three (a √3 × √3 sub-lattice, (i−j) ≡ 0 mod 3) is expanded into
// a regular dodecagon. That works because a hexagon plus the six squares on its edges and the six
// triangles in its corner gaps has a dodecagonal outline of the same edge length (its apothem is the
// hexagon apothem √3/2 plus the square's 1, which equals a unit dodecagon's apothem (2+√3)/2). Around
// each dodecagon the twelve edges alternate hexagon / square (config 4.6.12); the remaining hexagons,
// squares and triangles keep the rhombitrihexagonal 3.4.6.4 vertices. Hexagonal symmetry (p6m).
//
// A ring square/corner triangle is emitted only when NONE of the hexagons it touches was expanded —
// otherwise the dodecagon already covers it. Squares/triangles are deduped by centroid, then welded.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT3 = Math.sqrt(3)
const S = SQRT3 + 1 // hexagon-centre spacing (hex apothem + square + hex apothem)
const R12 = 1 / (2 * Math.sin(Math.PI / 12)) // dodecagon circumradius (edge 1)

const DODECAGON = makeShapeDef('dodecagon', 12)
const HEXAGON = makeShapeDef('hexagon', 6)
const SQUARE = makeShapeDef('square', 4)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (2 * SQRT3 + 3) / 6 // rhombitrihexagonal cell / 6 tiles — keeps tile count ~ n²

const META: TilingMeta = {
  id: 'dodecagon-hex',
  name: 'Dodecagon & Hexagon',
  vertexConfig: '3.4.6.12',
  chiral: false,
  edgeToEdge: true,
  // class: 0=central tile (dodecagon on the √3 sub-lattice, else hexagon) of cell (i, j);
  // 1..6=the square on hexagon edge k (class = 1 + k); 7..12=the corner triangle at vertex k.
  latticeLabels: ['i', 'j', 'class'],
}

// Hexagon that became a dodecagon: the index-4 sub-lattice (both coords even, spacing 2S). This keeps
// the dodecagons far enough apart that genuine rhombitrihexagonal fabric — hexagons ringed by squares
// with triangles in the corners — survives between them (the denser index-3 √3 sub-lattice absorbs
// every triangle and just reproduces the truncated-trihexagonal 4.6.12).
function isDodecagon(i: number, j: number): boolean {
  return (((i % 2) + 2) % 2 === 0) && (((j % 2) + 2) % 2 === 0)
}
// Hexagon cell reached by crossing edge k (k's outward normal is at 60k + 30°).
const EDGE_NEIGHBOR: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
]
// Unit outward normal of hexagon edge k (its midpoint is at angle 60k + 30°).
function edgeNormal(k: number): Vec2 {
  const a = (Math.PI / 180) * (60 * k + 30)
  return { x: Math.cos(a), y: Math.sin(a) }
}
function hexCenter(i: number, j: number): Vec2 {
  return { x: i * S * (SQRT3 / 2), y: i * S * 0.5 + j * S }
}

type Cand = { id: string; shape: 'dodecagon' | 'hexagon' | 'square' | 'triangle'; lattice: number[]; vertices: Vec2[] }

export function dodecagonHexTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const margin = S
  const iMax = Math.ceil((half + margin) / (S * (SQRT3 / 2))) + 1
  const inRegion = (c: Vec2, lim: number) => c.x >= -lim && c.x <= lim && c.y >= -lim && c.y <= lim
  const key = (c: Vec2) => `${Math.round(c.x / 0.2)},${Math.round(c.y / 0.2)}`

  const kept: Cand[] = []
  const squares = new Map<string, Cand>()
  const tris = new Map<string, Cand>()

  for (let i = -iMax; i <= iMax; i += 1) {
    const jLo = Math.floor((-half - margin - i * S * 0.5) / S)
    const jHi = Math.ceil((half + margin - i * S * 0.5) / S)
    for (let j = jLo; j <= jHi; j += 1) {
      const center = hexCenter(i, j)
      if (!inRegion(center, half + margin)) continue
      const dod = isDodecagon(i, j)
      // Central tile: dodecagon on the sub-lattice, otherwise a hexagon.
      if (inRegion(center, half)) {
        if (dod) {
          kept.push({ id: `dod:${i},${j}`, shape: 'dodecagon', lattice: [i, j, 0], vertices: regularPolygonVertices(center, R12, 12, Math.PI / 12) })
        } else {
          kept.push({ id: `hex:${i},${j}`, shape: 'hexagon', lattice: [i, j, 0], vertices: regularPolygonVertices(center, 1, 6, 0) })
        }
      }
      if (dod) continue // this hexagon's ring squares/triangles are inside its dodecagon
      const v = regularPolygonVertices(center, 1, 6, 0)
      for (let k = 0; k < 6; k += 1) {
        const nk = edgeNormal(k)
        const a = v[k]
        const b = v[(k + 1) % 6]
        // Square bridging edge k — only if the hexagon across it wasn't expanded.
        const [di, dj] = EDGE_NEIGHBOR[k]
        if (!isDodecagon(i + di, j + dj)) {
          const sq = [a, { x: a.x + nk.x, y: a.y + nk.y }, { x: b.x + nk.x, y: b.y + nk.y }, b]
          const sk = key(centroid(sq))
          if (!squares.has(sk)) squares.set(sk, { id: `sq:${sk}`, shape: 'square', lattice: [i, j, 1 + k], vertices: sq })
        }
        // Corner triangle at vertex k — only if neither hexagon flanking that corner was expanded.
        const [pi, pj] = EDGE_NEIGHBOR[(k + 5) % 6]
        if (!isDodecagon(i + di, j + dj) && !isDodecagon(i + pi, j + pj)) {
          const np = edgeNormal((k + 5) % 6)
          const tri = [a, { x: a.x + np.x, y: a.y + np.y }, { x: a.x + nk.x, y: a.y + nk.y }]
          const tk = key(centroid(tri))
          if (!tris.has(tk)) tris.set(tk, { id: `tri:${tk}`, shape: 'triangle', lattice: [i, j, 7 + k], vertices: tri })
        }
      }
    }
  }

  for (const sq of squares.values()) if (inRegion(centroid(sq.vertices), half)) kept.push(sq)
  for (const tri of tris.values()) if (inRegion(centroid(tri.vertices), half)) kept.push(tri)

  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({ id: t.id, shape: t.shape, lattice: t.lattice, vertices: t.vertices }))
  return stitch(raws, { dodecagon: DODECAGON, hexagon: HEXAGON, square: SQUARE, triangle: TRIANGLE }, META)
}
