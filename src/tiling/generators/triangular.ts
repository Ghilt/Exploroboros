// Triangular tiling (3.3.3.3.3.3) — equilateral triangles, six around every vertex. Each lattice
// rhombus (i, j) splits into an up-triangle and a down-triangle; together they tile the plane.
// Vertices come from a shared lattice function V(i, j), so coincident corners are bit-identical
// and stitch() pairs shared edges exactly.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const H = Math.sqrt(3) / 2 // height of a unit equilateral triangle
const TRIANGLE = makeShapeDef('triangle', 3)
const TRIANGLE_AREA = Math.sqrt(3) / 4

const META: TilingMeta = {
  id: 'triangular',
  name: 'Triangular',
  vertexConfig: '3.3.3.3.3.3',
  chiral: false,
  edgeToEdge: true,
  // Each rhombus (i, j) holds an up- and a down-triangle, so row+column alone collide; the
  // orientation dimension (0=up, 1=down) makes the coordinate unique.
  latticeLabels: ['i', 'j', 'orientation'],
}

// Triangular lattice point (i, j): rows are sheared right by half a step each.
function vertex(i: number, j: number): Vec2 {
  return { x: i + 0.5 * j, y: j * H }
}

type Cand = { kind: 'u' | 'd'; i: number; j: number; vertices: Vec2[] }

// Tile a square region ~`n` (tile count tracks n²; half = (n/2)·√tileArea matches the square's
// N×N at the same slider value). The region is clipped by centroid, so the border is ragged.
export function triangularTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(TRIANGLE_AREA))
  const jMax = Math.ceil((half + 1) / H) + 1
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half

  const cands: Cand[] = []
  for (let j = -jMax; j <= jMax; j += 1) {
    const iLo = Math.floor(-half - 1 - 0.5 * j)
    const iHi = Math.ceil(half + 1 - 0.5 * j)
    for (let i = iLo; i <= iHi; i += 1) {
      // up-triangle and down-triangle of rhombus (i, j); both wound CCW
      cands.push({ kind: 'u', i, j, vertices: [vertex(i, j), vertex(i + 1, j), vertex(i, j + 1)] })
      cands.push({ kind: 'd', i, j, vertices: [vertex(i + 1, j), vertex(i + 1, j + 1), vertex(i, j + 1)] })
    }
  }

  const kept = cands.filter((t) => inRegion(centroid(t.vertices)))
  weldVertices(kept, 1e-6)

  const raws: RawTile[] = kept.map((t) => ({
    id: `tri:${t.kind}:${t.i},${t.j}`,
    shape: 'triangle',
    lattice: [t.i, t.j, t.kind === 'u' ? 0 : 1],
    vertices: t.vertices,
  }))
  return stitch(raws, { triangle: TRIANGLE }, META)
}
