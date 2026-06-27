// Truncated hexagonal tiling (3.12.12) — regular dodecagons on a triangular lattice (so each has
// six dodecagon neighbours), with equilateral triangles filling the gaps. A flat-top dodecagon's
// twelve edges alternate: the even-index ones face the triangle gaps, the odd-index ones are
// shared with neighbouring dodecagons. Each triangle is the outward equilateral triangle on an
// even edge; it's generated three times (once per surrounding dodecagon) and deduped by centroid.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, regularPolygonVertices } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT3 = Math.sqrt(3)
const D = 2 + SQRT3 // dodecagon flat-to-flat = lattice spacing (edge 1)
const R12 = 1 / (2 * Math.sin(Math.PI / 12)) // dodecagon circumradius
const TRI_H = SQRT3 / 2

const DODECAGON = makeShapeDef('dodecagon', 12)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (D * D * (SQRT3 / 2)) / 3 // lattice cell area / (1 dodecagon + 2 triangles)

const META: TilingMeta = {
  id: 'truncated-hexagonal',
  name: 'Truncated Hexagonal',
  vertexConfig: '3.12.12',
  chiral: false,
  edgeToEdge: true,
  // Coordinates are keyed to the producing lattice cell (i, j) plus a class: 0=dodecagon,
  // 1..6=the gap-triangle on the dodecagon's even edge e (class = 1 + e/2). A triangle is shared by
  // three dodecagons but recorded once, by whichever cell emits it first — so (i, j, class) stays
  // unique. (Previously the deduped triangles used a rounded centroid, which was opaque and not
  // provably collision-free.)
  latticeLabels: ['i', 'j', 'class'],
}

type Cand = { id: string; shape: 'dodecagon' | 'triangle'; lattice: number[]; vertices: Vec2[] }

export function truncatedHexagonalTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const margin = D
  const jMax = Math.ceil((half + margin) / (D * (SQRT3 / 2))) + 1
  const inRegion = (c: Vec2, lim: number) => c.x >= -lim && c.x <= lim && c.y >= -lim && c.y <= lim

  // Dodecagons on the triangular lattice; keep those centred in the region (margin ones are still
  // used to build boundary triangles).
  const kept: Cand[] = []
  const tris = new Map<string, Cand>()
  for (let j = -jMax; j <= jMax; j += 1) {
    const iLo = Math.floor((-half - margin) / D - 0.5 * j)
    const iHi = Math.ceil((half + margin) / D - 0.5 * j)
    for (let i = iLo; i <= iHi; i += 1) {
      const center: Vec2 = { x: D * (i + 0.5 * j), y: D * (SQRT3 / 2) * j }
      if (!inRegion(center, half + margin)) continue
      const verts = regularPolygonVertices(center, R12, 12, Math.PI / 12)
      if (inRegion(center, half)) {
        kept.push({ id: `dod:${i},${j}`, shape: 'dodecagon', lattice: [i, j, 0], vertices: verts })
      }
      // Even edges face triangle gaps; build the outward equilateral triangle on each.
      for (let e = 0; e < 12; e += 2) {
        const p = verts[e]
        const q = verts[(e + 1) % 12]
        const apex: Vec2 = { x: (p.x + q.x) / 2 + (q.y - p.y) * TRI_H, y: (p.y + q.y) / 2 - (q.x - p.x) * TRI_H }
        const tri = [p, apex, q]
        const c = centroid(tri)
        const key = `${Math.round(c.x / 0.2)},${Math.round(c.y / 0.2)}`
        if (!tris.has(key)) {
          tris.set(key, { id: `tri:${key}`, shape: 'triangle', lattice: [i, j, 1 + e / 2], vertices: tri })
        }
      }
    }
  }

  for (const tri of tris.values()) {
    if (inRegion(centroid(tri.vertices), half)) kept.push(tri)
  }

  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({ id: t.id, shape: t.shape, lattice: t.lattice, vertices: t.vertices }))
  return stitch(raws, { dodecagon: DODECAGON, triangle: TRIANGLE }, META)
}
