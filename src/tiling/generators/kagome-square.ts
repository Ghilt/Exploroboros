// [3.4.4.6; 3.6.3.6] — a 2-uniform tiling of hexagons, squares and triangles: horizontal rows of the
// trihexagonal (kagome) pattern (flat-top hexagons that touch their in-row neighbours corner-to-corner,
// with an up- and a down-triangle filling each corner gap → 3.6.3.6 vertices) separated by solid rows
// of unit squares (→ 3.4.4.6 vertices where two squares, a hexagon and a triangle meet). Reconstructed
// from Wikimedia's SVG (File:2-uniform_n7.svg). Fundamental domain per cell: 1 hexagon + 2 triangles +
// 2 squares, whose areas sum to 2(1+√3) = the cell area.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices, windCCW } from './util'

const H = Math.sqrt(3) / 2 // unit-triangle / hexagon-apothem height
const P = 1 + Math.sqrt(3) // vertical period: half-hexagon + square + half-hexagon
const HEXAGON = makeShapeDef('hexagon', 6)
const SQUARE = makeShapeDef('square', 4)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (2 * P) / 5 // cell area / 5 tiles (1 hexagon + 2 triangles + 2 squares)

const META: TilingMeta = {
  id: 'kagome-square',
  name: 'Kagome & Squares',
  vertexConfig: '3.4.4.6 / 3.6.3.6',
  chiral: false,
  edgeToEdge: true,
  // Cell (m, k) = hexagon at (2m, kP). class: 0=hexagon, 1=down-triangle, 2=up-triangle (both at the
  // in-row corner 2m+1), 3=square above the hexagon, 4=square above the down-triangle.
  latticeLabels: ['m', 'k', 'class'],
}

type Cand = { id: string; shape: 'hexagon' | 'square' | 'triangle'; lattice: number[]; vertices: Vec2[] }

export function kagomeSquareTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const mMax = Math.ceil((half + 2) / 2) + 1
  const kMax = Math.ceil((half + 2) / P) + 1
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half

  const cands: Cand[] = []
  for (let k = -kMax; k <= kMax; k += 1) {
    const y = k * P
    for (let m = -mMax; m <= mMax; m += 1) {
      const x = 2 * m
      // Hexagon (flat-top: horizontal top/bottom edges, pointy left/right).
      cands.push({ id: `hex:${m},${k}`, shape: 'hexagon', lattice: [m, k, 0], vertices: regularPolygonVertices({ x, y }, 1, 6, 0) })
      // The two triangles filling the corner gap where this hexagon meets its right neighbour.
      const cx = x + 1 // in-row corner between hexagons (2m) and (2m+2)
      const down = windCCW([{ x: cx, y }, { x: cx + 0.5, y: y + H }, { x: cx - 0.5, y: y + H }])
      cands.push({ id: `td:${m},${k}`, shape: 'triangle', lattice: [m, k, 1], vertices: down })
      const up = windCCW([{ x: cx, y }, { x: cx - 0.5, y: y - H }, { x: cx + 0.5, y: y - H }])
      cands.push({ id: `tu:${m},${k}`, shape: 'triangle', lattice: [m, k, 2], vertices: up })
      // The two squares in the strip above this row: one on the hexagon top, one on the down-triangle top.
      const yb = y + H
      const yt = yb + 1
      const sqh = [{ x: x - 0.5, y: yb }, { x: x + 0.5, y: yb }, { x: x + 0.5, y: yt }, { x: x - 0.5, y: yt }]
      cands.push({ id: `sqh:${m},${k}`, shape: 'square', lattice: [m, k, 3], vertices: sqh })
      const sqt = [{ x: cx - 0.5, y: yb }, { x: cx + 0.5, y: yb }, { x: cx + 0.5, y: yt }, { x: cx - 0.5, y: yt }]
      cands.push({ id: `sqt:${m},${k}`, shape: 'square', lattice: [m, k, 4], vertices: sqt })
    }
  }

  const kept = cands.filter((t) => inRegion(centroid(t.vertices)))
  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({ id: t.id, shape: t.shape, lattice: t.lattice, vertices: t.vertices }))
  return stitch(raws, { hexagon: HEXAGON, square: SQUARE, triangle: TRIANGLE }, META)
}
