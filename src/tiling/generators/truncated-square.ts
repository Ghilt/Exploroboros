// Truncated square tiling (4.8.8) — regular octagons on a square lattice with small squares
// (drawn as diamonds) filling the diagonal gaps. An octagon shares its axis-aligned edges with
// the four neighbouring octagons and its diagonal edges with the four corner squares.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT2 = Math.SQRT2
const P = 1 + SQRT2 // lattice pitch = octagon flat-to-flat (edge 1)
const OCT_R = 1 / (2 * Math.sin(Math.PI / 8)) // octagon circumradius
const SQ_R = SQRT2 / 2 // unit-square circumradius

const OCTAGON = makeShapeDef('octagon', 8)
const SQUARE = makeShapeDef('square', 4)
const AVG_AREA = (P * P) / 2 // one octagon + one square per lattice cell

const META: TilingMeta = {
  id: 'truncated-square',
  name: 'Truncated Square',
  vertexConfig: '4.8.8',
  chiral: false,
  edgeToEdge: true,
  // Each cell (i, j) holds one octagon and one square; the class dimension (0=octagon, 1=square)
  // separates them.
  latticeLabels: ['i', 'j', 'class'],
}

type Cand = { kind: 'octagon' | 'square'; i: number; j: number; vertices: Vec2[] }

// Tile count tracks n² (half = (n/2)·√avgArea, matching the square at the same slider value).
export function truncatedSquareTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const max = Math.ceil((half + P) / P) + 1
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half

  const cands: Cand[] = []
  for (let i = -max; i <= max; i += 1) {
    for (let j = -max; j <= max; j += 1) {
      const oc: Vec2 = { x: i * P, y: j * P }
      if (inRegion(oc)) {
        cands.push({ kind: 'octagon', i, j, vertices: regularPolygonVertices(oc, OCT_R, 8, Math.PI / 8) })
      }
      const sc: Vec2 = { x: (i + 0.5) * P, y: (j + 0.5) * P } // square sits at the cell corner
      if (inRegion(sc)) {
        cands.push({ kind: 'square', i, j, vertices: regularPolygonVertices(sc, SQ_R, 4, 0) })
      }
    }
  }

  weldVertices(cands, 1e-6)
  const raws: RawTile[] = cands.map((t) => ({
    id: `${t.kind === 'octagon' ? 'oct' : 'sq'}:${t.i},${t.j}`,
    shape: t.kind,
    lattice: [t.i, t.j, t.kind === 'octagon' ? 0 : 1],
    vertices: t.vertices,
  }))
  return stitch(raws, { octagon: OCTAGON, square: SQUARE }, META)
}
