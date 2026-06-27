// Trihexagonal tiling (3.6.3.6, "kagome") — hexagons and triangles, built as the medial of a
// triangular lattice: one hexagon around every lattice vertex, one small triangle inside every
// lattice face. Every corner is the midpoint of a lattice edge, computed consistently, so the
// hexagon edge and the triangle edge that share it are bit-identical.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT3 = Math.sqrt(3)
const HEXAGON = makeShapeDef('hexagon', 6)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (2 * SQRT3) / 3 // cell area (base edge 2) / 3 tiles (1 hexagon + 2 triangles)

const META: TilingMeta = {
  id: 'trihexagonal',
  name: 'Trihexagonal',
  vertexConfig: '3.6.3.6',
  chiral: false,
  edgeToEdge: true,
  // Hexagon, up-triangle and down-triangle of cell (i, j) all share [i, j]; the class dimension
  // (0=hexagon, 1=up-triangle, 2=down-triangle) separates them.
  latticeLabels: ['i', 'j', 'class'],
}

// Base triangular lattice with edge length 2, so the medial tiles have edge 1.
function vtx(i: number, j: number): Vec2 {
  return { x: 2 * i + j, y: j * SQRT3 }
}
function mid(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// cls: lattice class dimension — 0=hexagon, 1=up-triangle, 2=down-triangle.
type Cand = { id: string; shape: 'hexagon' | 'triangle'; i: number; j: number; cls: number; vertices: Vec2[] }

export function trihexagonalTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const jMax = Math.ceil((half + 2) / SQRT3) + 1
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half

  const cands: Cand[] = []
  for (let j = -jMax; j <= jMax; j += 1) {
    const iLo = Math.floor((-half - 2 - j) / 2)
    const iHi = Math.ceil((half + 2 - j) / 2)
    for (let i = iLo; i <= iHi; i += 1) {
      const v = vtx(i, j)
      // Hexagon around vertex (i, j): midpoints toward its six neighbours, CCW from east.
      if (inRegion(v)) {
        cands.push({
          id: `hex:${i},${j}`,
          shape: 'hexagon',
          i,
          j,
          cls: 0,
          vertices: [
            mid(v, vtx(i + 1, j)),
            mid(v, vtx(i, j + 1)),
            mid(v, vtx(i - 1, j + 1)),
            mid(v, vtx(i - 1, j)),
            mid(v, vtx(i, j - 1)),
            mid(v, vtx(i + 1, j - 1)),
          ],
        })
      }
      // Medial triangle of the up-face and the down-face of cell (i, j).
      const up = [mid(v, vtx(i + 1, j)), mid(vtx(i + 1, j), vtx(i, j + 1)), mid(vtx(i, j + 1), v)]
      if (inRegion(centroid(up))) cands.push({ id: `tu:${i},${j}`, shape: 'triangle', i, j, cls: 1, vertices: up })
      const d0 = vtx(i + 1, j)
      const d1 = vtx(i + 1, j + 1)
      const d2 = vtx(i, j + 1)
      const dn = [mid(d0, d1), mid(d1, d2), mid(d2, d0)]
      if (inRegion(centroid(dn))) cands.push({ id: `td:${i},${j}`, shape: 'triangle', i, j, cls: 2, vertices: dn })
    }
  }

  weldVertices(cands, 1e-6)
  const raws: RawTile[] = cands.map((t) => ({ id: t.id, shape: t.shape, lattice: [t.i, t.j, t.cls], vertices: t.vertices }))
  return stitch(raws, { hexagon: HEXAGON, triangle: TRIANGLE }, META)
}
