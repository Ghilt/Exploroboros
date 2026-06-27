// Snub square tiling (3.3.4.3.4) — the chiral "snub quadrille". Squares appear in two orientations
// (rotated +15 and -15 degrees) on a square lattice of spacing a = (1+sqrt3)/sqrt2, with an
// equilateral triangle on every square edge. Each square is ringed by four triangles (no two squares
// share an edge — that's what separates it from the elongated-triangular tiling). The +15 squares sit
// on the lattice points, the -15 squares at the cell centres; the four triangles round each +15
// square cover every triangle exactly once. Welded so stitch pairs the shared edges.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT3 = Math.sqrt(3)
const A = (1 + SQRT3) / Math.SQRT2 // lattice spacing (+15 squares); -15 squares at the cell centres
const SQ_R = Math.SQRT1_2 // unit square circumradius
const TRI_H = SQRT3 / 2

const SQUARE = makeShapeDef('square', 4)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (2 + SQRT3) / 6 // cell area / 6 tiles (2 squares + 4 triangles)

const META: TilingMeta = {
  id: 'snub-square',
  name: 'Snub Square',
  vertexConfig: '3.3.4.3.4',
  chiral: true,
  edgeToEdge: true,
}

type Cand = { id: string; shape: 'square' | 'triangle'; lattice: number[]; vertices: Vec2[] }

export function snubSquareTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const margin = A
  const lim = half + margin
  const inRegion = (c: Vec2, l: number) => c.x >= -l && c.x <= l && c.y >= -l && c.y <= l
  const iLo = Math.floor(-lim / A)
  const iHi = Math.ceil(lim / A)

  const kept: Cand[] = []
  for (let i = iLo; i <= iHi; i += 1) {
    for (let j = iLo; j <= iHi; j += 1) {
      const plus: Vec2 = { x: i * A, y: j * A }
      if (!inRegion(plus, lim)) continue
      // +15 deg square on the lattice point (vertices at 60 + 90k deg).
      const vp = regularPolygonVertices(plus, SQ_R, 4, Math.PI / 3)
      if (inRegion(plus, half)) {
        kept.push({ id: `sp:${i},${j}`, shape: 'square', lattice: [i, j], vertices: vp })
      }
      // -15 deg square at the cell centre (vertices at 30 + 90k deg).
      const minus: Vec2 = { x: plus.x + A / 2, y: plus.y + A / 2 }
      if (inRegion(minus, half)) {
        const vm = regularPolygonVertices(minus, SQ_R, 4, Math.PI / 6)
        kept.push({ id: `sm:${i},${j}`, shape: 'square', lattice: [i, j], vertices: vm })
      }
      // Outward equilateral triangle on each edge of the +15 square (covers every triangle once).
      for (let k = 0; k < 4; k += 1) {
        const a = vp[k]
        const b = vp[(k + 1) % 4]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const apex: Vec2 = { x: (a.x + b.x) / 2 + dy * TRI_H, y: (a.y + b.y) / 2 - dx * TRI_H }
        const tri = [a, apex, b]
        if (inRegion(centroid(tri), half)) {
          kept.push({ id: `t:${i},${j},${k}`, shape: 'triangle', lattice: [i, j], vertices: tri })
        }
      }
    }
  }

  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({ id: t.id, shape: t.shape, lattice: t.lattice, vertices: t.vertices }))
  return stitch(raws, { square: SQUARE, triangle: TRIANGLE }, META)
}
