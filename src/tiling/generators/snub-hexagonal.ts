// Snub hexagonal tiling (3.3.3.3.6) — the chiral "snub hextille". Regular hexagons sit on a sqrt7
// triangular lattice, each rotated by atan(sqrt3/5) ~= 19.1 deg (the lattice's own tilt), with an
// equilateral triangle on every hexagon edge. The remaining gaps — one per lattice triangle — are
// filled by a further triangle whose three corners are the nearest edge-triangle apexes of the three
// surrounding hexagons. That gives 8 triangles per hexagon (6 edge + 2 gap), ratio 8:1. Welded so
// stitch pairs the shared edges.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, regularPolygonVertices, signedArea } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT3 = Math.sqrt(3)
const SQRT7 = Math.sqrt(7)
const THETA = Math.atan2(SQRT3, 5) // hexagon rotation = the sqrt7 lattice's tilt (~19.106 deg)
const TRI_H = SQRT3 / 2

const HEXAGON = makeShapeDef('hexagon', 6)
const TRIANGLE = makeShapeDef('triangle', 3)
const AVG_AREA = (7 * SQRT3) / 18 // cell area (7*sqrt3/2) / 9 tiles (1 hexagon + 8 triangles)

const META: TilingMeta = {
  id: 'snub-hexagonal',
  name: 'Snub Hexagonal',
  vertexConfig: '3.3.3.3.6',
  chiral: true,
  edgeToEdge: true,
  // Each cell (i, j) holds a hexagon, six edge-triangles and two gap-triangles; the role dimension
  // separates them (0=hexagon, 1..6=edge-triangle on hexagon edge k, 7=up-gap, 8=down-gap).
  latticeLabels: ['i', 'j', 'role'],
}

// Outward equilateral apex of edge a->b of a CCW polygon (rotate the edge -90 deg, step out by the
// triangle height). Computed identically wherever an apex is needed, so the values coincide exactly.
function apexOf(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { x: (a.x + b.x) / 2 + dy * TRI_H, y: (a.y + b.y) / 2 - dx * TRI_H }
}

function hexVertices(center: Vec2): Vec2[] {
  return regularPolygonVertices(center, 1, 6, THETA)
}

// The six edge-triangle apexes of the hexagon at `center`.
function apexesOf(center: Vec2): Vec2[] {
  const v = hexVertices(center)
  const out: Vec2[] = []
  for (let k = 0; k < 6; k += 1) out.push(apexOf(v[k], v[(k + 1) % 6]))
  return out
}

// The gap triangle around centroid `g`: the apex nearest `g` from each of the three hexagons.
function gapTriangle(g: Vec2, centers: ReadonlyArray<Vec2>): Vec2[] {
  const pts = centers.map((c) => {
    let best = apexesOf(c)[0]
    let bestD = Infinity
    for (const ap of apexesOf(c)) {
      const d = (ap.x - g.x) ** 2 + (ap.y - g.y) ** 2
      if (d < bestD) {
        bestD = d
        best = ap
      }
    }
    return best
  })
  return signedArea(pts) < 0 ? [pts[0], pts[2], pts[1]] : pts
}

type Cand = { id: string; shape: 'hexagon' | 'triangle'; lattice: number[]; vertices: Vec2[] }

export function snubHexagonalTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(AVG_AREA))
  const margin = SQRT7
  const lim = half + margin
  const inRegion = (c: Vec2, l: number) => c.x >= -l && c.x <= l && c.y >= -l && c.y <= l
  const jMax = Math.ceil(lim / (SQRT7 * (SQRT3 / 2))) + 1

  const center = (i: number, j: number): Vec2 => ({ x: SQRT7 * (i + 0.5 * j), y: SQRT7 * (SQRT3 / 2) * j })

  const kept: Cand[] = []
  for (let j = -jMax; j <= jMax; j += 1) {
    const iLo = Math.floor(-lim / SQRT7 - 0.5 * j)
    const iHi = Math.ceil(lim / SQRT7 - 0.5 * j)
    for (let i = iLo; i <= iHi; i += 1) {
      const c = center(i, j)
      if (!inRegion(c, lim)) continue
      const v = hexVertices(c)
      if (inRegion(c, half)) {
        kept.push({ id: `h:${i},${j}`, shape: 'hexagon', lattice: [i, j, 0], vertices: v })
      }
      // Edge-triangle on each hexagon edge.
      for (let k = 0; k < 6; k += 1) {
        const a = v[k]
        const b = v[(k + 1) % 6]
        const tri = [a, apexOf(a, b), b]
        if (inRegion(centroid(tri), half)) {
          kept.push({ id: `et:${i},${j},${k}`, shape: 'triangle', lattice: [i, j, 1 + k], vertices: tri })
        }
      }
      // Two gap triangles per cell, at its up- and down-triangle centroids.
      const cE = center(i + 1, j)
      const cN = center(i, j + 1)
      const cNE = center(i + 1, j + 1)
      const gUp: Vec2 = { x: (c.x + cE.x + cN.x) / 3, y: (c.y + cE.y + cN.y) / 3 }
      const gDn: Vec2 = { x: (cE.x + cN.x + cNE.x) / 3, y: (cE.y + cN.y + cNE.y) / 3 }
      if (inRegion(gUp, half)) {
        kept.push({ id: `gu:${i},${j}`, shape: 'triangle', lattice: [i, j, 7], vertices: gapTriangle(gUp, [c, cE, cN]) })
      }
      if (inRegion(gDn, half)) {
        kept.push({ id: `gd:${i},${j}`, shape: 'triangle', lattice: [i, j, 8], vertices: gapTriangle(gDn, [cE, cN, cNE]) })
      }
    }
  }

  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({ id: t.id, shape: t.shape, lattice: t.lattice, vertices: t.vertices }))
  return stitch(raws, { hexagon: HEXAGON, triangle: TRIANGLE }, META)
}
