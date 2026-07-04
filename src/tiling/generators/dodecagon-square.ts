// 3.4.3.12 tiling — regular dodecagons on a square lattice, edge-to-edge with their four axis
// neighbours, plus a small motif filling each square cell: one axis-aligned square (side 1) at the
// cell centre with an equilateral triangle on each of its four edges, pointing at the four
// dodecagon-pair seams. Two vertex types: 3.12.12 (two dodecagons + a triangle, at each shared
// dodecagon edge's endpoints) and 3.4.3.12 (dodecagon + triangle + square + triangle, at the square
// corners). Square symmetry (p4m). Areas close exactly: dodecagon (6+3√3) + square 1 + 4 triangles
// (√3) = (2+√3)² per cell.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices, windCCW } from './util'

const SQRT3 = Math.sqrt(3)
const H = SQRT3 / 2 // unit-triangle height
const D = 2 + SQRT3 // dodecagon-centre spacing = 2 × dodecagon apothem (edge-to-edge on axes)
const R12 = 1 / (2 * Math.sin(Math.PI / 12)) // dodecagon circumradius (edge 1)

const DODECAGON = makeShapeDef('dodecagon', 12)
const SQUARE = makeShapeDef('square', 4)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (D * D) / 6 // cell area / 6 tiles (1 dodecagon + 1 square + 4 triangles)

const META: TilingMeta = {
  id: 'dodecagon-square',
  name: 'Dodecagon & Square',
  vertexConfig: '3.4.3.12',
  chiral: false,
  edgeToEdge: true,
  // class: 0=dodecagon (at lattice point i,j), 1=cell square, 2..5=cell triangle (S,E,N,W).
  latticeLabels: ['i', 'j', 'class'],
}

type Cand = { id: string; shape: 'dodecagon' | 'square' | 'triangle'; lattice: number[]; vertices: Vec2[] }

export function dodecagonSquareTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const iMax = Math.ceil((half + D) / D) + 1
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half

  const kept: Cand[] = []
  for (let j = -iMax; j <= iMax; j += 1) {
    for (let i = -iMax; i <= iMax; i += 1) {
      // Dodecagon at lattice point (i, j), a flat edge facing each axis (rotation 15°).
      const dc: Vec2 = { x: i * D, y: j * D }
      if (inRegion(dc)) {
        kept.push({
          id: `dod:${i},${j}`,
          shape: 'dodecagon',
          lattice: [i, j, 0],
          vertices: regularPolygonVertices(dc, R12, 12, Math.PI / 12),
        })
      }
      // Cell (i, j): the gap centred between the four dodecagons at (i,j),(i+1,j),(i,j+1),(i+1,j+1).
      const cx = (i + 0.5) * D
      const cy = (j + 0.5) * D
      const square = [
        { x: cx - 0.5, y: cy - 0.5 },
        { x: cx + 0.5, y: cy - 0.5 },
        { x: cx + 0.5, y: cy + 0.5 },
        { x: cx - 0.5, y: cy + 0.5 },
      ]
      if (inRegion({ x: cx, y: cy })) {
        kept.push({ id: `sq:${i},${j}`, shape: 'square', lattice: [i, j, 1], vertices: square })
      }
      // One triangle on each square edge, apex pointing outward at the dodecagon-pair seam.
      const tris: Array<[number, Vec2[]]> = [
        [2, [{ x: cx - 0.5, y: cy - 0.5 }, { x: cx + 0.5, y: cy - 0.5 }, { x: cx, y: cy - 0.5 - H }]], // S
        [3, [{ x: cx + 0.5, y: cy - 0.5 }, { x: cx + 0.5, y: cy + 0.5 }, { x: cx + 0.5 + H, y: cy }]], // E
        [4, [{ x: cx - 0.5, y: cy + 0.5 }, { x: cx + 0.5, y: cy + 0.5 }, { x: cx, y: cy + 0.5 + H }]], // N
        [5, [{ x: cx - 0.5, y: cy - 0.5 }, { x: cx - 0.5, y: cy + 0.5 }, { x: cx - 0.5 - H, y: cy }]], // W
      ]
      for (const [cls, v] of tris) {
        if (inRegion(centroid(v))) {
          kept.push({ id: `tri:${i},${j},${cls}`, shape: 'triangle', lattice: [i, j, cls], vertices: windCCW(v) })
        }
      }
    }
  }

  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({ id: t.id, shape: t.shape, lattice: t.lattice, vertices: t.vertices }))
  return stitch(raws, { dodecagon: DODECAGON, square: SQUARE, triangle: TRIANGLE }, META)
}
