// The "hat" — the aperiodic *monotile* (Smith, Myers, Kaplan & Goodman-Strauss, 2023): a single
// 13-sided tile (plus its mirror) that tiles the plane only aperiodically. There's no lattice and no
// simple deflation of the tile itself; it's generated through the paper's four **metatiles** (H, T, P,
// F) — clusters of hats that inflate-and-subdivide. This is a faithful port of Craig Kaplan's reference
// implementation (github.com/isohedral/hatviz): constructPatch() assembles the metatiles per the
// substitution rule table, constructMetatiles() derives the next, larger H/T/P/F from that patch, and we
// recurse a few levels, then walk the hierarchy to emit every hat polygon.
//
// NOTE on stitch: the hat outline has edges of length 1, √3 AND one of length 2, so hats do NOT meet
// strictly edge-to-edge (a length-2 edge abuts two shorter neighbour edges — a T-junction). We add the
// missing mid-edge vertices to each hat so every side coincides with exactly one neighbour side, which
// lets the generic stitch() build a proper adjacency graph.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid, signedArea } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices, windCCW } from './util'

const hr3 = 0.8660254037844386 // √3 / 2
const PI = Math.PI
const IDENT: number[] = [1, 0, 0, 0, 1, 0]

// --- affine 2×3 matrix + point helpers (Kaplan's geometry.js) ---
const pt = (x: number, y: number): Vec2 => ({ x, y })
function mul(A: number[], B: number[]): number[] {
  return [
    A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
    A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5],
  ]
}
const ttrans = (tx: number, ty: number): number[] => [1, 0, tx, 0, 1, ty]
function trot(ang: number): number[] {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [c, -s, 0, s, c, 0]
}
const transPt = (M: number[], P: Vec2): Vec2 => pt(M[0] * P.x + M[1] * P.y + M[2], M[3] * P.x + M[4] * P.y + M[5])
function inv(T: number[]): number[] {
  const det = T[0] * T[4] - T[1] * T[3]
  return [T[4] / det, -T[1] / det, (T[1] * T[5] - T[2] * T[4]) / det, -T[3] / det, T[0] / det, (T[2] * T[3] - T[0] * T[5]) / det]
}
const matchSeg = (p: Vec2, q: Vec2): number[] => [q.x - p.x, p.y - q.y, p.x, q.y - p.y, q.x - p.x, p.y]
const matchTwo = (p1: Vec2, q1: Vec2, p2: Vec2, q2: Vec2): number[] => mul(matchSeg(p2, q2), inv(matchSeg(p1, q1)))
const rotAbout = (p: Vec2, ang: number): number[] => mul(ttrans(p.x, p.y), mul(trot(ang), ttrans(-p.x, -p.y)))
function intersect(p1: Vec2, q1: Vec2, p2: Vec2, q2: Vec2): Vec2 {
  const d = (q2.y - p2.y) * (q1.x - p1.x) - (q2.x - p2.x) * (q1.y - p1.y)
  const uA = ((q2.x - p2.x) * (p1.y - p2.y) - (q2.y - p2.y) * (p1.x - p2.x)) / d
  return pt(p1.x + uA * (q1.x - p1.x), p1.y + uA * (q1.y - p1.y))
}
const padd = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x + q.x, y: p.y + q.y })
const psub = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x - q.x, y: p.y - q.y })
const hexPt = (x: number, y: number): Vec2 => pt(x + 0.5 * y, hr3 * y)

// The 13-vertex hat outline (on the hex grid).
const hat_outline: Vec2[] = [
  hexPt(0, 0), hexPt(-1, -1), hexPt(0, -2), hexPt(2, -2), hexPt(2, -1), hexPt(4, -2), hexPt(5, -1),
  hexPt(4, 0), hexPt(3, 0), hexPt(2, 2), hexPt(0, 3), hexPt(0, 2), hexPt(-1, 2),
]

// A leaf: one hat, with a label (H/T/P/F for colour, H1 = reflected placement).
class HatTile {
  label: string
  shape = hat_outline
  constructor(label: string) {
    this.label = label
  }
}
// A cluster whose children are placed sub-tiles (metatiles or hats).
class MetaTile {
  shape: Vec2[]
  width: number
  children: Array<{ T: number[]; geom: HatTile | MetaTile }>
  constructor(shape: Vec2[], width: number) {
    this.shape = shape
    this.width = width
    this.children = []
  }
  addChild(T: number[], geom: HatTile | MetaTile) {
    this.children.push({ T, geom })
  }
  evalChild(n: number, i: number): Vec2 {
    return transPt(this.children[n].T, this.children[n].geom.shape[i])
  }
  recentre() {
    let cx = 0
    let cy = 0
    for (const p of this.shape) {
      cx += p.x
      cy += p.y
    }
    cx /= this.shape.length
    cy /= this.shape.length
    for (let idx = 0; idx < this.shape.length; idx += 1) this.shape[idx] = padd(this.shape[idx], pt(-cx, -cy))
    const M = ttrans(-cx, -cy)
    for (const ch of this.children) ch.T = mul(M, ch.T)
  }
}

// The four base metatiles, each a small cluster of hats (fresh instances per call so nothing aliases
// across builds — determinism).
function baseTiles(): { H: MetaTile; T: MetaTile; P: MetaTile; F: MetaTile } {
  const H1_hat = new HatTile('H1')
  const H_hat = new HatTile('H')
  const T_hat = new HatTile('T')
  const P_hat = new HatTile('P')
  const F_hat = new HatTile('F')

  const H_outline = [pt(0, 0), pt(4, 0), pt(4.5, hr3), pt(2.5, 5 * hr3), pt(1.5, 5 * hr3), pt(-0.5, hr3)]
  const H = new MetaTile(H_outline, 2)
  H.addChild(matchTwo(hat_outline[5], hat_outline[7], H_outline[5], H_outline[0]), H_hat)
  H.addChild(matchTwo(hat_outline[9], hat_outline[11], H_outline[1], H_outline[2]), H_hat)
  H.addChild(matchTwo(hat_outline[5], hat_outline[7], H_outline[3], H_outline[4]), H_hat)
  H.addChild(mul(ttrans(2.5, hr3), mul([-0.5, -hr3, 0, hr3, -0.5, 0], [0.5, 0, 0, 0, -0.5, 0])), H1_hat)

  const T_outline = [pt(0, 0), pt(3, 0), pt(1.5, 3 * hr3)]
  const T = new MetaTile(T_outline, 2)
  T.addChild([0.5, 0, 0.5, 0, 0.5, hr3], T_hat)

  const P_outline = [pt(0, 0), pt(4, 0), pt(3, 2 * hr3), pt(-1, 2 * hr3)]
  const P = new MetaTile(P_outline, 2)
  P.addChild([0.5, 0, 1.5, 0, 0.5, hr3], P_hat)
  P.addChild(mul(ttrans(0, 2 * hr3), mul([0.5, hr3, 0, -hr3, 0.5, 0], [0.5, 0.0, 0.0, 0.0, 0.5, 0.0])), P_hat)

  const F_outline = [pt(0, 0), pt(3, 0), pt(3.5, hr3), pt(3, 2 * hr3), pt(-1, 2 * hr3)]
  const F = new MetaTile(F_outline, 2)
  F.addChild([0.5, 0, 1.5, 0, 0.5, hr3], F_hat)
  F.addChild(mul(ttrans(0, 2 * hr3), mul([0.5, hr3, 0, -hr3, 0.5, 0], [0.5, 0.0, 0.0, 0.0, 0.5, 0.0])), F_hat)

  return { H, T, P, F }
}

// Assemble one H-supertile from the four metatiles, per the substitution rule table.
type Rule = Array<number | string>
const RULES: Rule[] = [
  ['H'], [0, 0, 'P', 2], [1, 0, 'H', 2], [2, 0, 'P', 2], [3, 0, 'H', 2], [4, 4, 'P', 2],
  [0, 4, 'F', 3], [2, 4, 'F', 3], [4, 1, 3, 2, 'F', 0], [8, 3, 'H', 0], [9, 2, 'P', 0], [10, 2, 'H', 0],
  [11, 4, 'P', 2], [12, 0, 'H', 2], [13, 0, 'F', 3], [14, 2, 'F', 1], [15, 3, 'H', 4], [8, 2, 'F', 1],
  [17, 3, 'H', 0], [18, 2, 'P', 0], [19, 2, 'H', 2], [20, 4, 'F', 3], [20, 0, 'P', 2], [22, 0, 'H', 2],
  [23, 4, 'F', 3], [23, 0, 'F', 3], [16, 0, 'P', 2], [9, 4, 0, 2, 'T', 2], [4, 0, 'F', 3],
]

function constructPatch(H: MetaTile, T: MetaTile, P: MetaTile, F: MetaTile): MetaTile {
  const ret = new MetaTile([], H.width)
  const shapes: Record<string, MetaTile> = { H, T, P, F }
  for (const r of RULES) {
    if (r.length === 1) {
      ret.addChild(IDENT, shapes[r[0] as string])
    } else if (r.length === 4) {
      const poly = ret.children[r[0] as number].geom.shape
      const Tm = ret.children[r[0] as number].T
      const Pp = transPt(Tm, poly[((r[1] as number) + 1) % poly.length])
      const Qp = transPt(Tm, poly[r[1] as number])
      const nshp = shapes[r[2] as string]
      const npoly = nshp.shape
      ret.addChild(matchTwo(npoly[r[3] as number], npoly[((r[3] as number) + 1) % npoly.length], Pp, Qp), nshp)
    } else {
      const chP = ret.children[r[0] as number]
      const chQ = ret.children[r[2] as number]
      const Pp = transPt(chQ.T, chQ.geom.shape[r[3] as number])
      const Qp = transPt(chP.T, chP.geom.shape[r[1] as number])
      const nshp = shapes[r[4] as string]
      const npoly = nshp.shape
      ret.addChild(matchTwo(npoly[r[5] as number], npoly[((r[5] as number) + 1) % npoly.length], Pp, Qp), nshp)
    }
  }
  return ret
}

// Derive the next (2× larger) H/T/P/F metatiles from an H-supertile patch.
function constructMetatiles(patch: MetaTile): [MetaTile, MetaTile, MetaTile, MetaTile] {
  const bps1 = patch.evalChild(8, 2)
  const bps2 = patch.evalChild(21, 2)
  const rbps = transPt(rotAbout(bps1, (-2.0 * PI) / 3.0), bps2)
  const p72 = patch.evalChild(7, 2)
  const p252 = patch.evalChild(25, 2)
  const llc = intersect(bps1, rbps, patch.evalChild(6, 2), p72)
  let w = psub(patch.evalChild(6, 2), llc)

  const new_H_outline = [llc, bps1]
  w = transPt(trot(-PI / 3), w)
  new_H_outline.push(padd(new_H_outline[1], w))
  new_H_outline.push(patch.evalChild(14, 2))
  w = transPt(trot(-PI / 3), w)
  new_H_outline.push(psub(new_H_outline[3], w))
  new_H_outline.push(patch.evalChild(6, 2))
  const new_H = new MetaTile(new_H_outline, patch.width * 2)
  for (const ch of [0, 9, 16, 27, 26, 6, 1, 8, 10, 15]) new_H.addChild(patch.children[ch].T, patch.children[ch].geom)

  const new_P_outline = [p72, padd(p72, psub(bps1, llc)), bps1, llc]
  const new_P = new MetaTile(new_P_outline, patch.width * 2)
  for (const ch of [7, 2, 3, 4, 28]) new_P.addChild(patch.children[ch].T, patch.children[ch].geom)

  const new_F_outline = [bps2, patch.evalChild(24, 2), patch.evalChild(25, 0), p252, padd(p252, psub(llc, bps1))]
  const new_F = new MetaTile(new_F_outline, patch.width * 2)
  for (const ch of [21, 20, 22, 23, 24, 25]) new_F.addChild(patch.children[ch].T, patch.children[ch].geom)

  const AAA = new_H_outline[2]
  const BBB = padd(new_H_outline[1], psub(new_H_outline[4], new_H_outline[5]))
  const CCC = transPt(rotAbout(BBB, -PI / 3), AAA)
  const new_T = new MetaTile([BBB, CCC, AAA], patch.width * 2)
  new_T.addChild(patch.children[11].T, patch.children[11].geom)

  new_H.recentre()
  new_P.recentre()
  new_F.recentre()
  new_T.recentre()
  return [new_H, new_T, new_P, new_F]
}

// Walk the hierarchy, accumulating transforms, collecting every hat's placement.
function collectHats(geom: HatTile | MetaTile, T: number[], out: Array<{ T: number[]; label: string }>) {
  if (geom instanceof HatTile) {
    out.push({ T, label: geom.label })
  } else {
    for (const ch of geom.children) collectHats(ch.geom, mul(T, ch.T), out)
  }
}

const HAT = makeShapeDef('hat', 13)
const HAT_R = makeShapeDef('hat-reflected', 13)
const HAT_AREA = Math.abs(signedArea(hat_outline))

const META: TilingMeta = {
  id: 'hat',
  name: 'Hat (einstein)',
  vertexConfig: 'aperiodic monotile',
  chiral: false,
  edgeToEdge: false,
  latticeLabels: ['index'],
}

// Split each hat side at any neighbouring vertex that lands on it, so the tiling reads as edge-to-edge
// for stitch(). All hat corners are collected; any that lies strictly inside another hat's side becomes
// an extra vertex on that side.
function insertTJunctions(polys: Vec2[][]): Vec2[][] {
  const q = 1e-4
  const corners = new Map<string, Vec2>()
  for (const poly of polys) for (const v of poly) corners.set(`${Math.round(v.x / q)},${Math.round(v.y / q)}`, v)
  // Spatial hash the corners (cell ≈ longest hat edge) so each side only tests nearby points.
  const CELL = 2
  const grid = new Map<string, Vec2[]>()
  const cellKey = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`
  for (const v of corners.values()) {
    const k = cellKey(v.x, v.y)
    const b = grid.get(k)
    if (b) b.push(v)
    else grid.set(k, [v])
  }
  const near = (a: Vec2, b: Vec2): Vec2[] => {
    const out: Vec2[] = []
    const cx0 = Math.floor(Math.min(a.x, b.x) / CELL) - 1
    const cx1 = Math.floor(Math.max(a.x, b.x) / CELL) + 1
    const cy0 = Math.floor(Math.min(a.y, b.y) / CELL) - 1
    const cy1 = Math.floor(Math.max(a.y, b.y) / CELL) + 1
    for (let cx = cx0; cx <= cx1; cx += 1) for (let cy = cy0; cy <= cy1; cy += 1) {
      const b2 = grid.get(`${cx},${cy}`)
      if (b2) out.push(...b2)
    }
    return out
  }
  const onSegment = (a: Vec2, b: Vec2, p: Vec2): boolean => {
    const abx = b.x - a.x
    const aby = b.y - a.y
    const apx = p.x - a.x
    const apy = p.y - a.y
    const len2 = abx * abx + aby * aby
    const cross = abx * apy - aby * apx
    if (Math.abs(cross) > 1e-6 * Math.sqrt(len2)) return false // not collinear
    const t = (apx * abx + apy * aby) / len2
    return t > 1e-4 && t < 1 - 1e-4 // strictly between the endpoints
  }
  return polys.map((poly) => {
    const out: Vec2[] = []
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      out.push(a)
      const mids = near(a, b)
        .filter((p) => onSegment(a, b, p))
        .sort((u, v) => (u.x - a.x) ** 2 + (u.y - a.y) ** 2 - ((v.x - a.x) ** 2 + (v.y - a.y) ** 2))
      out.push(...mids)
    }
    return out
  })
}

export function buildHatPolys(n: number): Array<{ shape: string; vertices: Vec2[] }> {
  const half = Math.max(4, (n / 2) * Math.sqrt(HAT_AREA))
  let { H, T, P, F } = baseTiles()
  let level = 0
  const radius = (m: MetaTile) => Math.max(...m.shape.map((p) => Math.hypot(p.x, p.y)))
  while (radius(H) < (half + 6) * 1.5 && level < 7) {
    const patch = constructPatch(H, T, P, F)
    ;[H, T, P, F] = constructMetatiles(patch)
    level += 1
  }
  const placements: Array<{ T: number[]; label: string }> = []
  collectHats(H, IDENT, placements)

  const raw = placements.map((pl) => {
    const verts = windCCW(hat_outline.map((p) => transPt(pl.T, p)))
    const reflected = pl.T[0] * pl.T[4] - pl.T[1] * pl.T[3] < 0
    return { shape: reflected ? 'hat-reflected' : 'hat', vertices: verts, centroid: centroid(verts) }
  })
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half
  const kept = raw.filter((r) => inRegion(r.centroid))
  const withT = insertTJunctions(kept.map((k) => k.vertices))
  return kept.map((k, i) => ({ shape: k.shape, vertices: withT[i] }))
}

export function hatTiling(n: number): Tiling {
  const polys = buildHatPolys(n)
  const tagged = polys.map((p, i) => ({ id: `hat:${i}`, shape: p.shape, vertices: p.vertices, index: i }))
  weldVertices(tagged, 1e-6)
  const raws: RawTile[] = tagged.map((t) => ({ id: t.id, shape: t.shape, lattice: [t.index], vertices: t.vertices }))
  return stitch(raws, { hat: HAT, 'hat-reflected': HAT_R }, META)
}
