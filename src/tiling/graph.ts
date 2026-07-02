// Query API over a stitched Tiling. Adjacency is derived on demand from sides + edges,
// so the Tiling itself stays a plain serialisable structure.

import type { EdgeEnd, ShapeDef, Tiling, TileNode, TilingEdge, Vec2 } from './types'
import { oppositeSides } from './shapes'
import { clockwiseFromTopKey } from './geometry'

const TWO_PI = Math.PI * 2

// id -> node lookups are common; cache one map per Tiling without mutating the Tiling.
const indexCache = new WeakMap<Tiling, Map<string, TileNode>>()

function indexOf(tiling: Tiling): Map<string, TileNode> {
  let index = indexCache.get(tiling)
  if (!index) {
    index = new Map()
    for (const node of tiling.nodes) index.set(node.id, node)
    indexCache.set(tiling, index)
  }
  return index
}

export function nodeById(tiling: Tiling, id: string): TileNode | undefined {
  return indexOf(tiling).get(id)
}

export function isBoundary(edge: TilingEdge): boolean {
  return edge.b === null
}

export function sideToEdge(tiling: Tiling, tile: string, side: number): TilingEdge {
  const node = mustNode(tiling, tile)
  const s = node.sides[side]
  if (!s) throw new Error(`graph: tile '${tile}' has no side ${side}`)
  return tiling.edges[s.edgeId]
}

// Cross a side to the neighbour you arrive on, or null at a boundary. Round-trips:
// across(across(t, A, k)) === { tile: A, side: k }. This replaces the prototype's
// (k+4)%8 formula — the pairing is stored on the edge, so it works for any tiling.
export function across(tiling: Tiling, tile: string, side: number): EdgeEnd | null {
  return otherEnd(sideToEdge(tiling, tile, side), tile, side)
}

// One entry per shared edge, in ascending local-side order with boundary sides skipped
// (so result index i is not necessarily side i). A neighbour sharing two edges appears
// twice (the edges-touched count).
export function neighborEdges(tiling: Tiling, tile: string): EdgeEnd[] {
  const node = mustNode(tiling, tile)
  const result: EdgeEnd[] = []
  for (const s of node.sides) {
    const other = otherEnd(tiling.edges[s.edgeId], tile, s.geometry.localIndex)
    if (other) result.push(other)
  }
  return result
}

// Distinct neighbour tiles (a two-edge neighbour counts once).
export function uniqueNeighbors(tiling: Tiling, tile: string): string[] {
  const seen = new Set<string>()
  for (const end of neighborEdges(tiling, tile)) seen.add(end.tile)
  return [...seen]
}

// The local side(s) opposite `side` on this tile's shape (1 for even N, 2 for odd N).
export function opposite(tiling: Tiling, tile: string, side: number): number[] {
  const node = mustNode(tiling, tile)
  if (side < 0 || side >= node.sides.length) {
    throw new Error(`graph: tile '${tile}' has no side ${side}`)
  }
  const shape = tiling.shapes[node.shape] as ShapeDef | undefined
  const opp = shape?.oppositeSides[side]
  return opp ? [...opp] : oppositeSides(side, node.sides.length)
}

// Local side indices ordered clockwise from the top — the side whose outward normal points
// most northward is index 0, then clockwise. This is the canonical, tiling-agnostic edge
// numbering shown to the user; it does not depend on the internal CCW winding.
export function clockwiseEdgeOrder(node: TileNode): number[] {
  const n = node.sides.length
  // Anchor index 0 at the edge whose normal points MOST northward (smallest distance to straight up,
  // either side), then walk the boundary CLOCKWISE. Sides are wound CCW, so clockwise = decreasing
  // local index. Walking the PERIMETER (rather than sorting by outward-normal angle) keeps the numbers
  // monotonic around the boundary even on CONCAVE tiles — the wedge's normals zig-zag, so a normal-angle
  // sort scattered its numbering. For convex tiles the two agree. Anchoring on the most-north edge also
  // sidesteps the 0/360 seam (a top edge just west of north, by a float hair on flat-top octagons — the
  // slot-0 kalleboda bug — or tens of degrees on the chiral snubs). The custom straight-through pairing
  // (a shape's oppositeSides) is independent of this numbering.
  const distToNorth = (a: number) => {
    const k = clockwiseFromTopKey(a)
    return Math.min(k, 360 - k)
  }
  let anchor = 0
  for (let k = 1; k < n; k += 1) {
    if (distToNorth(node.sides[k].geometry.normalAngle) < distToNorth(node.sides[anchor].geometry.normalAngle)) anchor = k
  }
  const order: number[] = []
  for (let i = 0; i < n; i += 1) order.push((anchor - i + n) % n)
  return order
}

// ---- edge-number <-> local-side helpers (the traverser "heading" is a clockwise-from-top edge NUMBER) ----

// The local side backing a user-facing clockwise-from-top edge number (wraps, so heading+1 off the top
// edge is always valid).
export function edgeToLocalSide(node: TileNode, edge: number): number {
  const order = clockwiseEdgeOrder(node)
  const n = order.length
  return order[((edge % n) + n) % n]
}

// Inverse: the clockwise-from-top edge number of a local side.
export function localSideToEdge(node: TileNode, localSide: number): number {
  return clockwiseEdgeOrder(node).indexOf(localSide)
}

// The clockwise-from-top edge number whose outward normal is closest to `angle`. Used once, at the
// serialisation boundary, to turn a seed's stored aim ANGLE into the edge-index heading the engine runs on.
export function nearestEdge(node: TileNode, angle: number): number {
  const order = clockwiseEdgeOrder(node)
  let best = 0
  let bestDiff = Infinity
  for (let e = 0; e < order.length; e += 1) {
    const d = smallestAngle(node.sides[order[e]].geometry.normalAngle, angle)
    if (d < bestDiff) {
      bestDiff = d
      best = e
    }
  }
  return best
}

// The outward-normal angle (radians, world y-up) of a heading edge. Used once, at the serialisation
// boundary, to turn the edge-index heading back into a stored aim ANGLE. Normalises -0 → 0 so the
// stored value survives a JSON round-trip identically.
export function edgeNormalAngle(node: TileNode, edge: number): number {
  const a = node.sides[edgeToLocalSide(node, edge)].geometry.normalAngle
  return a === 0 ? 0 : a
}

// Unit direction (world y-up, from the centroid) to draw a walker's heading arrow. The heading IS an
// edge number, so the arrow always points at that edge's MIDPOINT — truthful on convex and concave
// (wedge) tiles alike, with no special cases. (On a regular convex tile the midpoint direction equals
// the edge's outward normal, so nothing there shifts.)
export function headingArrowDir(node: TileNode, edge: number): Vec2 {
  const m = node.sides[edgeToLocalSide(node, edge)].geometry.midpoint
  const dx = m.x - node.centroid.x
  const dy = m.y - node.centroid.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

function smallestAngle(a: number, b: number): number {
  let d = Math.abs(a - b) % TWO_PI
  if (d > Math.PI) d = TWO_PI - d
  return d
}

function otherEnd(edge: TilingEdge, tile: string, side: number): EdgeEnd | null {
  if (edge.b === null) return null
  return edge.a.tile === tile && edge.a.side === side ? edge.b : edge.a
}

function mustNode(tiling: Tiling, id: string): TileNode {
  const node = nodeById(tiling, id)
  if (!node) throw new Error(`graph: unknown tile '${id}'`)
  return node
}
