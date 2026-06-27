// Kalleboda — the octagon + wedge tiling carried over from the prototype. Regular flat-top
// octagons sit on a 22.5°-rotated square lattice; concave 3-notch "wedge" tiles fill the gaps
// (6 octagons + 4 wedges per repeating cell). It is non-edge-to-edge in the loose sense that an
// octagon and a wedge often share *two* unit edges — but every shared boundary is still a full
// unit edge, so once coincident vertices are welded the generic stitch() pairs them like any
// other tiling. The patch is clipped to a square region by tile centroid, so its outer border is
// intentionally ragged (whole tiles, no clean rectangle).

import type { RawTile, ShapeDef, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices } from './util'

const SQRT2 = Math.SQRT2
const OCT_R = 1 / (2 * Math.sin(Math.PI / 8)) // octagon circumradius for edge length 1
const F2F = 1 + SQRT2 // octagon flat-to-flat width

// Canonical shapes in shape units (edge length 1), y-up, wound CCW. Octagon vertex k at angle
// 22.5 + 45k degrees (flat top). The wedge is concave (reflex vertices at 1, 4, 7) with one unit
// edge in each of the 8 compass directions.
const OCTAGON: ReadonlyArray<Vec2> = Array.from({ length: 8 }, (_, k) => {
  const a = ((22.5 + 45 * k) * Math.PI) / 180
  return { x: OCT_R * Math.cos(a), y: OCT_R * Math.sin(a) }
})

const WEDGE: ReadonlyArray<Vec2> = [
  { x: 0, y: 0 },
  { x: SQRT2 / 2, y: SQRT2 / 2 },
  { x: 1 + SQRT2 / 2, y: SQRT2 / 2 },
  { x: 1 + SQRT2 / 2, y: 1 + SQRT2 / 2 },
  { x: SQRT2 / 2, y: 1 + SQRT2 / 2 },
  { x: 0, y: F2F },
  { x: -SQRT2 / 2, y: 1 + SQRT2 / 2 },
  { x: 0, y: 1 },
]

// Lattice vectors (square lattice rotated 22.5°) and one repeating cell. Octagon centers are
// exact lattice points; the four wedge centers are approximate — exact seating is recovered by
// snapping each wedge's edges onto the neighbouring octagon edges (see seatWedge).
const U: Vec2 = { x: 3 + 2 * SQRT2, y: 1 + SQRT2 }
const V: Vec2 = { x: 1 + SQRT2, y: -(3 + 2 * SQRT2) }

const CELL_OCT: ReadonlyArray<Vec2> = [
  { x: 0, y: 0 },
  { x: 2.41421356, y: -2.41421356 },
  { x: 3.41421356, y: 0 },
  { x: 4.12132034, y: -4.12132034 },
  { x: 5.82842712, y: 0 },
  { x: 5.82842712, y: -2.41421356 },
]

const CELL_WEDGES: ReadonlyArray<{ c: Vec2; rot: number }> = [
  { c: { x: 1.61477986, y: -0.6688614 }, rot: 90 },
  { c: { x: 1.7453556, y: -4.02903007 }, rot: 0 },
  { c: { x: 4.21370349, y: -1.7453556 }, rot: 270 },
  { c: { x: 4.08312775, y: 1.61477986 }, rot: 180 },
]

const OCTAGON_SHAPE: ShapeDef = makeShapeDef('octagon', 8)
// Concave 8-gon. makeShapeDef's opposite-side / interior-angle values assume a regular polygon,
// so they're nominal for the wedge (unused by rendering or adjacency today) — it just needs an
// 8-side registry entry.
const WEDGE_SHAPE: ShapeDef = makeShapeDef('wedge', 8)

const META: TilingMeta = {
  id: 'kalleboda',
  name: 'Kalleboda',
  vertexConfig: 'octagon + wedge',
  chiral: false,
  edgeToEdge: false,
  // Each repeating cell (cell-u, cell-v) holds 6 octagons and 4 wedges; the slot dimension is the
  // within-cell index (octagons 0..5, wedges 6..9) so [cell-u, cell-v, slot] is unique.
  latticeLabels: ['cell-u', 'cell-v', 'slot'],
}

const SNAP_SEARCH = 0.55 // how far to look for a matching octagon edge when seating a wedge
const SNAP_TOL = 1e-4 // stop snapping once the median correction is this small
const WELD_EPS = 1e-2 // merge vertices closer than this (>> snap residual, << min tile gap)

function rotate(pts: ReadonlyArray<Vec2>, deg: number): Vec2[] {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return pts.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }))
}

function translate(pts: ReadonlyArray<Vec2>, dx: number, dy: number): Vec2[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

function mid(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// A uniform spatial hash of points, for nearest-point lookups while seating wedges.
class PointHash {
  private readonly cell: number
  private readonly buckets = new Map<string, Vec2[]>()

  constructor(cell: number) {
    this.cell = cell
  }

  add(p: Vec2): void {
    const key = `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`
    const b = this.buckets.get(key)
    if (b) b.push(p)
    else this.buckets.set(key, [p])
  }

  nearest(p: Vec2, maxDist: number): Vec2 | null {
    const cx = Math.floor(p.x / this.cell)
    const cy = Math.floor(p.y / this.cell)
    let best: Vec2 | null = null
    let bestD = maxDist
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const arr = this.buckets.get(`${cx + dx},${cy + dy}`)
        if (!arr) continue
        for (const q of arr) {
          const d = Math.hypot(q.x - p.x, q.y - p.y)
          if (d < bestD) {
            bestD = d
            best = q
          }
        }
      }
    }
    return best
  }
}

// Seat a wedge: rotate, drop its centroid on the approximate center, then snap by translating it
// so its edge midpoints land on the nearest octagon edge midpoints (median of the matches). A
// couple of iterations converge to exact coincidence; this is the prototype's method.
function seatWedge(center: Vec2, rot: number, octMids: PointHash): Vec2[] {
  const base = rotate(WEDGE, rot)
  const c = centroid(base)
  let poly = translate(base, center.x - c.x, center.y - c.y)
  for (let iter = 0; iter < 2; iter += 1) {
    const dxs: number[] = []
    const dys: number[] = []
    for (let i = 0; i < poly.length; i += 1) {
      const m = mid(poly[i], poly[(i + 1) % poly.length])
      const match = octMids.nearest(m, SNAP_SEARCH)
      if (match) {
        dxs.push(match.x - m.x)
        dys.push(match.y - m.y)
      }
    }
    if (dxs.length === 0) break
    const mdx = median(dxs)
    const mdy = median(dys)
    if (Math.abs(mdx) < SNAP_TOL && Math.abs(mdy) < SNAP_TOL) break
    poly = translate(poly, mdx, mdy)
  }
  return poly
}

type Cand = { kind: 'octagon' | 'wedge'; m: number; n: number; i: number; vertices: Vec2[] }

// Build the octagon+wedge tiling over a square region ~`n` shape units half-width (so the tile
// count tracks n² — comparable to the square's N×N at the same slider value).
export function kallebodaTiling(n: number): Tiling {
  const half = Math.max(2, n)
  const margin = 2 * F2F // keep neighbours just outside the clip so border wedges still seat
  const cellMin = Math.min(Math.hypot(U.x, U.y), Math.hypot(V.x, V.y))
  const span = Math.ceil((half * SQRT2 + margin) / cellMin) + 1
  const inRegion = (c: Vec2, lim: number) => c.x >= -lim && c.x <= lim && c.y >= -lim && c.y <= lim

  // Octagons (exact lattice placement) + a hash of their edge midpoints for wedge seating.
  const octs: Cand[] = []
  const octMids = new PointHash(SNAP_SEARCH)
  for (let m = -span; m <= span; m += 1) {
    for (let nn = -span; nn <= span; nn += 1) {
      const ox = m * U.x + nn * V.x
      const oy = m * U.y + nn * V.y
      for (let i = 0; i < CELL_OCT.length; i += 1) {
        const vertices = translate(OCTAGON, CELL_OCT[i].x + ox, CELL_OCT[i].y + oy)
        if (!inRegion(centroid(vertices), half + margin)) continue
        octs.push({ kind: 'octagon', m, n: nn, i, vertices })
        for (let e = 0; e < vertices.length; e += 1) {
          octMids.add(mid(vertices[e], vertices[(e + 1) % vertices.length]))
        }
      }
    }
  }

  // Wedges, each seated onto the octagons around it.
  const wedges: Cand[] = []
  for (let m = -span; m <= span; m += 1) {
    for (let nn = -span; nn <= span; nn += 1) {
      const ox = m * U.x + nn * V.x
      const oy = m * U.y + nn * V.y
      for (let i = 0; i < CELL_WEDGES.length; i += 1) {
        const w = CELL_WEDGES[i]
        const vertices = seatWedge({ x: w.c.x + ox, y: w.c.y + oy }, w.rot, octMids)
        if (!inRegion(centroid(vertices), half + margin)) continue
        wedges.push({ kind: 'wedge', m, n: nn, i, vertices })
      }
    }
  }

  // Keep tiles centred inside the region; dedupe by centroid as a guard against any lattice
  // redundancy placing two tiles in the same spot (which would make stitch non-manifold).
  const seen = new Set<string>()
  const kept: Cand[] = []
  for (const t of [...octs, ...wedges]) {
    const c = centroid(t.vertices)
    if (!inRegion(c, half)) continue
    const key = `${Math.round(c.x / 0.25)},${Math.round(c.y / 0.25)}`
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(t)
  }

  weldVertices(kept, WELD_EPS)

  const raws: RawTile[] = kept.map((t) => ({
    id: `${t.kind === 'octagon' ? 'oct' : 'wdg'}:${t.m},${t.n},${t.i}`,
    shape: t.kind,
    lattice: [t.m, t.n, t.kind === 'octagon' ? t.i : 6 + t.i],
    vertices: t.vertices,
  }))
  return stitch(raws, { octagon: OCTAGON_SHAPE, wedge: WEDGE_SHAPE }, META, { tolerance: WELD_EPS })
}
