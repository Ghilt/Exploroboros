// Truncated trihexagonal tiling (4.6.12, "great rhombitrihexagonal") — regular dodecagons on a
// triangular lattice, a square bridging each adjacent dodecagon pair, and a regular hexagon filling
// every gap where three dodecagons meet. A dodecagon's twelve edges alternate hexagon / square; the
// six odd edges face neighbouring dodecagons. Around every vertex: square, hexagon, dodecagon. The
// two hexagons of each lattice cell sit at its up- and down-triangle centres; squares are deduped by
// centroid (shared by two dodecagons), then everything is welded so stitch pairs the shared edges.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT3 = Math.sqrt(3)
const S = 3 + SQRT3 // dodecagon-centre spacing (dodecagon apothem + square + dodecagon apothem)
const R12 = 1 / (2 * Math.sin(Math.PI / 12)) // dodecagon circumradius (edge 1)

const DODECAGON = makeShapeDef('dodecagon', 12)
const HEXAGON = makeShapeDef('hexagon', 6)
const SQUARE = makeShapeDef('square', 4)
const AVG_AREA = 1.5 + SQRT3 // cell area / 6 tiles (1 dodecagon + 3 squares + 2 hexagons)

const META: TilingMeta = {
  id: 'truncated-trihexagonal',
  name: 'Truncated Trihexagonal',
  vertexConfig: '4.6.12',
  chiral: false,
  edgeToEdge: true,
}

type Cand = { id: string; shape: 'dodecagon' | 'hexagon' | 'square'; lattice: number[]; vertices: Vec2[] }

export function truncatedTrihexagonalTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const margin = S
  const jMax = Math.ceil((half + margin) / (S * (SQRT3 / 2))) + 1
  const inRegion = (c: Vec2, lim: number) => c.x >= -lim && c.x <= lim && c.y >= -lim && c.y <= lim
  const key = (c: Vec2) => `${Math.round(c.x / 0.2)},${Math.round(c.y / 0.2)}`

  const kept: Cand[] = []
  const squares = new Map<string, Cand>()

  for (let j = -jMax; j <= jMax; j += 1) {
    const iLo = Math.floor((-half - margin) / S - 0.5 * j)
    const iHi = Math.ceil((half + margin) / S - 0.5 * j)
    for (let i = iLo; i <= iHi; i += 1) {
      const center: Vec2 = { x: S * (i + 0.5 * j), y: S * (SQRT3 / 2) * j }
      if (!inRegion(center, half + margin)) continue
      const verts = regularPolygonVertices(center, R12, 12, Math.PI / 12)
      if (inRegion(center, half)) {
        kept.push({ id: `dod:${i},${j}`, shape: 'dodecagon', lattice: [i, j], vertices: verts })
      }
      // Odd edges bridge to the neighbouring dodecagon via a square.
      for (let e = 1; e < 12; e += 2) {
        const p = verts[e]
        const q = verts[(e + 1) % 12]
        const ang = (Math.PI / 180) * (30 + 30 * e)
        const nx = Math.cos(ang)
        const ny = Math.sin(ang)
        const sq = [p, { x: p.x + nx, y: p.y + ny }, { x: q.x + nx, y: q.y + ny }, q]
        const sc = centroid(sq)
        const sk = key(sc)
        if (!squares.has(sk)) {
          squares.set(sk, { id: `sq:${sk}`, shape: 'square', lattice: [Math.round(sc.x), Math.round(sc.y)], vertices: sq })
        }
      }
      // Two regular hexagons at the up- and down-triangle centres of this lattice cell. The triangle
      // centroids are center + (e1 + e2)/3 and center + 2(e1 + e2)/3, with e1 = (S, 0), e2 at 60 deg.
      const sumx = S * 1.5
      const sumy = S * (SQRT3 / 2)
      const hup: Vec2 = { x: center.x + sumx / 3, y: center.y + sumy / 3 }
      const hdn: Vec2 = { x: center.x + (2 * sumx) / 3, y: center.y + (2 * sumy) / 3 }
      if (inRegion(hup, half)) {
        kept.push({ id: `hu:${i},${j}`, shape: 'hexagon', lattice: [i, j], vertices: regularPolygonVertices(hup, 1, 6, 0) })
      }
      if (inRegion(hdn, half)) {
        kept.push({ id: `hd:${i},${j}`, shape: 'hexagon', lattice: [i, j], vertices: regularPolygonVertices(hdn, 1, 6, 0) })
      }
    }
  }

  for (const sq of squares.values()) if (inRegion(centroid(sq.vertices), half)) kept.push(sq)

  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({ id: t.id, shape: t.shape, lattice: t.lattice, vertices: t.vertices }))
  return stitch(raws, { dodecagon: DODECAGON, hexagon: HEXAGON, square: SQUARE }, META)
}
