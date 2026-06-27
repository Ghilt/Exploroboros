// Elongated triangular tiling (3.3.3.4.4) — rows of squares separated by rows of triangles. Each
// "super-row" is one square strip (height 1) plus one triangle strip (height √3/2). Consecutive
// square rows shift by half a square, which the triangle strip bridges (up-triangle bases sit on
// the lower squares' tops, down-triangle bases on the upper squares' bottoms).

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const H = Math.sqrt(3) / 2 // triangle-strip height
const SR = 1 + H // super-row height (square + triangle strip)
const SQUARE = makeShapeDef('square', 4)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (1 + H) / 3 // one square + two triangles per (super-row, column)

const META: TilingMeta = {
  id: 'elongated-triangular',
  name: 'Elongated Triangular',
  vertexConfig: '3.3.3.4.4',
  chiral: false,
  edgeToEdge: true,
  // Each (super-row, column) cell holds a square and two triangles; the class dimension
  // (0=square, 1=up-triangle, 2=down-triangle) separates them.
  latticeLabels: ['super-row', 'column', 'class'],
}

// cls: lattice class dimension — 0=square, 1=up-triangle, 2=down-triangle.
type Cand = { id: string; shape: 'square' | 'triangle'; s: number; i: number; cls: number; vertices: Vec2[] }

export function elongatedTriangularTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const sMax = Math.ceil((half + 2) / SR) + 1
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half

  const cands: Cand[] = []
  for (let s = -sMax; s <= sMax; s += 1) {
    const off = 0.5 * s // each square row shifts half a square
    const yb = s * SR // square-strip bottom
    const yt = yb + 1 // square-strip top = triangle-strip bottom
    const iLo = Math.floor(-half - 2 - off)
    const iHi = Math.ceil(half + 2 - off)
    for (let i = iLo; i <= iHi; i += 1) {
      const x = i + off
      const sq = [
        { x, y: yb },
        { x: x + 1, y: yb },
        { x: x + 1, y: yt },
        { x, y: yt },
      ]
      if (inRegion(centroid(sq))) cands.push({ id: `sq:${s},${i}`, shape: 'square', s, i, cls: 0, vertices: sq })
      // up-triangle: base on the square tops, apex into the strip
      const up = [
        { x, y: yt },
        { x: x + 1, y: yt },
        { x: x + 0.5, y: yt + H },
      ]
      if (inRegion(centroid(up))) cands.push({ id: `tu:${s},${i}`, shape: 'triangle', s, i, cls: 1, vertices: up })
      // down-triangle: apex on the square tops, base on the next row's bottoms (shifted +0.5)
      const dn = [
        { x: x + 1, y: yt },
        { x: x + 1.5, y: yt + H },
        { x: x + 0.5, y: yt + H },
      ]
      if (inRegion(centroid(dn))) cands.push({ id: `td:${s},${i}`, shape: 'triangle', s, i, cls: 2, vertices: dn })
    }
  }

  weldVertices(cands, 1e-6)
  const raws: RawTile[] = cands.map((t) => ({ id: t.id, shape: t.shape, lattice: [t.s, t.i, t.cls], vertices: t.vertices }))
  return stitch(raws, { square: SQUARE, triangle: TRIANGLE }, META)
}
