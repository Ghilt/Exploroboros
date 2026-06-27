// Query API over a stitched Tiling. Adjacency is derived on demand from sides + edges,
// so the Tiling itself stays a plain serialisable structure.

import type { EdgeEnd, ShapeDef, Tiling, TileNode, TilingEdge } from './types'
import { oppositeSides } from './shapes'
import { clockwiseFromTopKey } from './geometry'

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
  return node.sides
    .map((s) => ({ side: s.geometry.localIndex, key: clockwiseFromTopKey(s.geometry.normalAngle) }))
    .sort((a, b) => a.key - b.key)
    .map((e) => e.side)
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
