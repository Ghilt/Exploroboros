// Hexagonal tiling (6.6.6) — regular flat-top hexagons, three around every vertex. Centres sit on
// a column grid (spacing 1.5) with odd columns dropped half a row (√3/2). Coincident corners only
// differ by trig round-off, so weldVertices() fuses them before stitch().

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const HEXAGON = makeShapeDef('hexagon', 6)
const COL_W = 1.5 // horizontal centre spacing (edge length 1)
const ROW_H = Math.sqrt(3) // vertical centre spacing
const HEX_AREA = (3 * Math.sqrt(3)) / 2

const META: TilingMeta = {
  id: 'hexagonal',
  name: 'Hexagonal',
  vertexConfig: '6.6.6',
  chiral: false,
  edgeToEdge: true,
}

type Cand = { c: number; r: number; vertices: Vec2[] }

// Tile a square region ~`n` (tile count tracks n², matching the square at the same slider value).
// Clipped by centre, so the border is ragged.
export function hexagonalTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(HEX_AREA))
  const cMax = Math.ceil((half + 1) / COL_W) + 1
  const rMax = Math.ceil((half + 1) / ROW_H) + 1
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half

  const cands: Cand[] = []
  for (let c = -cMax; c <= cMax; c += 1) {
    const odd = ((c % 2) + 2) % 2 === 1
    for (let r = -rMax; r <= rMax; r += 1) {
      const center: Vec2 = { x: c * COL_W, y: r * ROW_H + (odd ? ROW_H / 2 : 0) }
      if (!inRegion(center)) continue
      cands.push({ c, r, vertices: regularPolygonVertices(center, 1, 6, 0) })
    }
  }

  weldVertices(cands, 1e-6)

  const raws: RawTile[] = cands.map((t) => ({
    id: `hex:${t.c},${t.r}`,
    shape: 'hexagon',
    lattice: [t.c, t.r],
    vertices: t.vertices,
  }))
  return stitch(raws, { hexagon: HEXAGON }, META)
}
