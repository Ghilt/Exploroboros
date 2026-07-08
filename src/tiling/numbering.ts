// Board tile NUMBERING schemes. A scheme orders the tiles; a tile's "number" is its position in that
// order (0-based, as the stats label + Inspect show). Three schemes, all working on ANY tiling (square /
// hex / triangular / penrose / hat / …) from geometry + adjacency alone:
//
//   left-to-right — reading order: rows top→bottom, each row left→right. Rows are found by clustering
//                   centroids on y (single-linkage with a half-tile gap), NOT the raw generation order
//                   (which e.g. numbers hexagons column-first). Row 0 is the topmost row.
//   spiral        — a TRUE spiral, as a greedy wall-following WALK: start at the centre tile and each
//                   step move to the unvisited neighbour reached by the SHARPEST RIGHT turn from the
//                   current heading (the largest clockwise turn short of reversing). On a filled convex
//                   patch this is the classic right-hand-rule spiral — it hugs the growing visited blob
//                   and winds outward as ONE connected +1 path from the centre to an edge tile, so
//                   consecutive numbers are always edge-adjacent. It is a WALK, not sorted rings (sorting
//                   into rings mis-orders a spiral both within and between rings, and a geometric arm-sort
//                   strands tiles); if the walk ever dead-ends before covering everything (a concave
//                   pocket / aperiodic patch), it resumes from the nearest unvisited tile so none is left.
//   radial        — concentric rings out from the centre: by distance, then clockwise-from-north angle.
//                   The numbers land in the right rings but jump back to the top at each new ring (it is
//                   not one flowing path) — kept as its own option.
//
// The scheme is the ONE user-facing tile number everywhere (stats label, Inspect, the `tile-number` DSL
// attribute, `@tile N`, and what `find-lowest/highest-tile` search by). Pure & isomorphic (no React/DOM);
// memoized per Tiling in a WeakMap like orientation.ts. Do NOT import from src/export — the bounds-centre
// math is inlined to keep the tiling engine dependency-free.

import type { Tiling } from './types'
import { uniqueNeighbors } from './graph'

export type NumberingScheme = 'left-to-right' | 'spiral' | 'radial'

type Numbering = { order: ReadonlyArray<string>; pos: ReadonlyMap<string, number> }

const cache = new WeakMap<Tiling, Partial<Record<NumberingScheme, Numbering>>>()

const TWO_PI = Math.PI * 2
// A string-id tiebreak so every scheme is a total, deterministic order (reproducible in export).
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// Typical centre-to-centre tile spacing — the sqrt of the average area per tile. Used as the row height
// (left-to-right) and the ring spacing (spiral). Guarded so a degenerate tiling never divides by zero.
function tileSpacing(tiling: Tiling): number {
  const { minX, minY, maxX, maxY } = tiling.bounds
  const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY)
  const s = Math.sqrt(area / Math.max(1, tiling.nodes.length))
  return s > 1e-9 ? s : 1
}

function buildLeftToRight(tiling: Tiling): string[] {
  const s = tileSpacing(tiling)
  const gap = s * 0.5 // a y-jump bigger than half a tile starts a new row
  // Cluster centroids into rows on descending y (top first): single-linkage, split on a gap > `gap`.
  const byY = [...tiling.nodes].sort((a, b) => b.centroid.y - a.centroid.y)
  const band = new Map<string, number>()
  let row = 0
  let prevY = byY.length ? byY[0].centroid.y : 0
  for (const n of byY) {
    if (prevY - n.centroid.y > gap) row += 1
    band.set(n.id, row)
    prevY = n.centroid.y
  }
  return [...tiling.nodes]
    .sort(
      (a, b) =>
        band.get(a.id)! - band.get(b.id)! || // topmost row first
        a.centroid.x - b.centroid.x || // then left → right
        byId(a.id, b.id),
    )
    .map((n) => n.id)
}

// Centre a tile as polar (r, clockwise-from-north angle) about the bounds centre. atan2(dx, dy) gives
// N=0, E=+pi/2, S=+/-pi, W=-pi/2; fold the angle to [0, 2pi) so a full sweep matches the edge-0=north frame.
function polar(tiling: Tiling) {
  const { minX, minY, maxX, maxY } = tiling.bounds
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return (id: string, x: number, y: number) => {
    const dx = x - cx
    const dy = y - cy
    let ang = Math.atan2(dx, dy)
    if (ang < 0) ang += TWO_PI
    return { id, r: Math.hypot(dx, dy), ang }
  }
}

// Direction (compass degrees: N=0, E=90, S=180, W=270) from one centroid to another. atan2(dx, dy) so it
// matches the edge-0=north frame; folded to [0, 360).
function dirDeg(fx: number, fy: number, tx: number, ty: number): number {
  const a = (Math.atan2(tx - fx, ty - fy) * 180) / Math.PI
  return (a + 360) % 360
}

// Nearest UNVISITED tile by graph distance from `from` (BFS out through already-visited tiles). Only used
// to RESUME the spiral after a dead-end — a concave pocket, or a disconnected patch — so the numbering
// stays one path as far as the tiling allows. Undefined only if nothing unvisited is reachable at all.
function nearestUnvisited(tiling: Tiling, from: string, visited: ReadonlySet<string>): string | undefined {
  const seen = new Set<string>([from])
  let frontier = [from]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of uniqueNeighbors(tiling, id)) {
        if (seen.has(nb)) continue
        if (!visited.has(nb)) return nb
        seen.add(nb)
        next.push(nb)
      }
    }
    frontier = next
  }
  return undefined
}

// A greedy wall-following WALK (the owner's definition of the spiral). See the module header. Start at the
// centre tile; each step go to the unvisited neighbour reached by the sharpest right turn from the current
// heading — maximise the signed clockwise turn, treating a ~180° reversal as disqualified (used only if it
// is the sole option). Angles come from centroids and neighbours from the edge graph, so "sharpest right"
// adapts to any tiling. Dead-ends resume from the nearest unvisited tile; a truly unreachable remainder is
// appended so the order is always a total permutation.
function buildSpiral(tiling: Tiling): string[] {
  const nodes = tiling.nodes
  if (nodes.length === 0) return []
  const cen = new Map<string, { x: number; y: number }>()
  for (const n of nodes) cen.set(n.id, n.centroid)

  const { minX, minY, maxX, maxY } = tiling.bounds
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  let start = nodes[0].id
  let best = Infinity
  for (const n of nodes) {
    const d = (n.centroid.x - cx) ** 2 + (n.centroid.y - cy) ** 2
    if (d < best - 1e-9 || (Math.abs(d - best) <= 1e-9 && n.id < start)) {
      best = d
      start = n.id
    }
  }

  const visited = new Set<string>([start])
  const order: string[] = [start]
  let current = start
  let heading = 0 // north; the first move is the sharpest right of north (→ "east"), so the spiral is clockwise

  while (order.length < nodes.length) {
    const here = cen.get(current)!
    let next: string | undefined
    let bestKey = -Infinity
    for (const id of uniqueNeighbors(tiling, current)) {
      if (visited.has(id)) continue
      const to = cen.get(id)!
      let s = (dirDeg(here.x, here.y, to.x, to.y) - heading) % 360
      if (s > 180) s -= 360
      if (s <= -180) s += 360 // s ∈ (-180, 180]; > 0 = clockwise (a right turn)
      // Non-reversals beat a forced reversal; within a class the largest s (sharpest right) wins; id breaks ties.
      const key = (Math.abs(s) > 179.5 ? -1000 : 0) + s
      if (next === undefined || key > bestKey + 1e-9 || (Math.abs(key - bestKey) <= 1e-9 && id < next)) {
        bestKey = key
        next = id
      }
    }
    if (next === undefined) {
      next = nearestUnvisited(tiling, current, visited)
      if (next === undefined) break // fully disconnected remainder → appended below
    }
    const to = cen.get(next)!
    heading = dirDeg(here.x, here.y, to.x, to.y)
    visited.add(next)
    order.push(next)
    current = next
  }

  if (order.length < nodes.length) for (const n of nodes) if (!visited.has(n.id)) order.push(n.id)
  return order
}

function buildRadial(tiling: Tiling): string[] {
  const p = polar(tiling)
  return tiling.nodes
    .map((n) => {
      const { r, ang } = p(n.id, n.centroid.x, n.centroid.y)
      return { id: n.id, d2: r * r, ang }
    })
    // Concentric rings by distance; within a ring by clockwise angle. (The angle resets each ring — the
    // numbering is right per ring but not one continuous path; that's `spiral`.)
    .sort((u, v) => u.d2 - v.d2 || u.ang - v.ang || byId(u.id, v.id))
    .map((e) => e.id)
}

function build(tiling: Tiling, scheme: NumberingScheme): Numbering {
  const order =
    scheme === 'left-to-right' ? buildLeftToRight(tiling) : scheme === 'spiral' ? buildSpiral(tiling) : buildRadial(tiling)
  const pos = new Map<string, number>()
  order.forEach((id, i) => pos.set(id, i))
  return { order, pos }
}

function numbering(tiling: Tiling, scheme: NumberingScheme): Numbering {
  let byScheme = cache.get(tiling)
  if (!byScheme) cache.set(tiling, (byScheme = {}))
  return byScheme[scheme] ?? (byScheme[scheme] = build(tiling, scheme))
}

// Tile ids in ascending "number" order under the scheme (index 0 = the lowest-numbered tile).
export function numberingOrder(tiling: Tiling, scheme: NumberingScheme): ReadonlyArray<string> {
  return numbering(tiling, scheme).order
}

// A tile's number under the scheme = its position in the order (0-based). Unknown id -> -1 (matches
// the existing `?? -1` fallback at the display call sites).
export function numberOf(tiling: Tiling, scheme: NumberingScheme, id: string): number {
  return numbering(tiling, scheme).pos.get(id) ?? -1
}

// The search bundle the traverse engine's find-lowest/highest-tile runs over: the order array plus an
// O(1) position lookup (both memoized). Shape-compatible with src/traverse's `Numbering` (structural).
export function numberingFor(tiling: Tiling, scheme: NumberingScheme): { order: ReadonlyArray<string>; posOf: (id: string) => number } {
  const n = numbering(tiling, scheme)
  return { order: n.order, posOf: (id) => n.pos.get(id) ?? -1 }
}
