// Resolving an EdgeRef to a concrete move. The shorthands (straight / r1 / l2 / edge N / unvisited)
// are turned into "which adjacent tile do I step to, facing which way" off the tile's own geometry —
// per-tile, so the same rule works on any polygon without the user tracking edge numbers.
//
// Direction frame: a side's clockwise-from-top key (0 at the top, increasing CLOCKWISE) matches the
// user-facing edge numbering and the Inspect rotate buttons. So a positive signed turn = clockwise =
// RIGHT, negative = left — `r1` is the first edge right of straight, `l1` the first to the left.

import type { Tiling, TileNode } from '../../tiling'
import { across, clockwiseEdgeOrder, clockwiseFromTopKey, nodeById, opposite } from '../../tiling'
import { tileState, visitCount, type TileState } from '../../canvas'
import type { EdgeRef, Movement } from './types'

const TWO_PI = Math.PI * 2

// Where a single hop lands: the tile stepped onto, and the new heading (the exit edge's outward
// normal — the direction of travel), or null at a boundary / when the ref has no such edge.
export type Hop = { tile: string; heading: number } | null

// Signed turn from the reference key to an edge key, in (-180, 180]. Positive = clockwise (right).
function signedTurn(refKey: number, edgeKey: number): number {
  let d = ((edgeKey - refKey) % 360 + 360) % 360
  if (d > 180) d -= 360
  return d
}

function smallestAngle(a: number, b: number): number {
  let d = Math.abs(a - b) % TWO_PI
  if (d > Math.PI) d = TWO_PI - d
  return d
}

// The least-turn UNVISITED neighbour — the built-in walker move (mirrors step.ts's chooseMove).
function resolveUnvisited(tiling: Tiling, overlay: ReadonlyMap<string, TileState>, tile: string, heading: number): Hop {
  const node = nodeById(tiling, tile)
  if (!node) return null
  let best: { tile: string; heading: number; turn: number } | null = null
  for (const side of clockwiseEdgeOrder(node)) {
    const end = across(tiling, tile, side)
    if (!end) continue
    if (visitCount(tileState(overlay, end.tile)) > 0) continue
    const normal = node.sides[side].geometry.normalAngle
    const turn = smallestAngle(heading, normal)
    if (!best || turn < best.turn - 1e-9) best = { tile: end.tile, heading: normal, turn }
  }
  return best ? { tile: best.tile, heading: best.heading } : null
}

// The local side a walker arrived THROUGH: its outward normal points back the way it came, i.e. most
// opposite to the heading (the heading is the direction of travel). The wedge's edges have distinct
// normals, so this is unambiguous. Used to make "straight" the edge opposite the entry edge.
function entrySide(node: TileNode, heading: number): number {
  let best = node.sides[0].geometry.localIndex
  let bestDiff = -1
  for (const s of node.sides) {
    const diff = smallestAngle(s.geometry.normalAngle, heading)
    if (diff > bestDiff) {
      bestDiff = diff
      best = s.geometry.localIndex
    }
  }
  return best
}

// Step across a chosen local side: the neighbour + the exit edge's normal as the new heading.
function step(tiling: Tiling, tile: string, side: number): Hop {
  const end = across(tiling, tile, side)
  if (!end) return null
  const node = nodeById(tiling, tile)!
  return { tile: end.tile, heading: node.sides[side].geometry.normalAngle }
}

export function resolveRef(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  tile: string,
  heading: number,
  movement: Movement,
  ref: EdgeRef,
): Hop {
  if (ref.kind === 'unvisited') return resolveUnvisited(tiling, overlay, tile, heading)
  const node = nodeById(tiling, tile)
  if (!node) return null
  const order = clockwiseEdgeOrder(node)

  if (ref.kind === 'edge') {
    const side = order[ref.index]
    return side === undefined ? null : step(tiling, tile, side)
  }

  // straight / turn: rank the sides by signed turn from the reference direction.
  const refKey = movement === 'absolute' ? 0 : clockwiseFromTopKey(heading)
  const entries = order.map((side) => ({
    side,
    sd: signedTurn(refKey, clockwiseFromTopKey(node.sides[side].geometry.normalAngle)),
  }))
  // straight = the least-turn edge (ties resolved by clockwise order, which `order` already is).
  let straight = entries[0]
  for (const e of entries) if (Math.abs(e.sd) < Math.abs(straight.sd) - 1e-9) straight = e

  // ...except a concave shape that declares its own through-pairing (the wedge): there "straight" is
  // the edge OPPOSITE the one entered, which the shape defines by hand, because its normals point in
  // visually-surprising directions and the least-turn edge lands somewhere a human wouldn't call
  // straight. Relative movement only — absolute "straight" stays the north-most edge (no entry edge).
  const shape = tiling.shapes[node.shape]
  if (movement === 'relative' && shape?.straightThroughOpposite) {
    const opp = opposite(tiling, tile, entrySide(node, heading))[0]
    const viaOpp = entries.find((e) => e.side === opp)
    if (viaOpp) straight = viaOpp
  }

  if (ref.kind === 'straight') return step(tiling, tile, straight.side)

  const others = entries.filter((e) => e !== straight)
  let pick: { side: number; sd: number } | undefined
  if (ref.dir === 'r') {
    pick = others.filter((e) => e.sd > 0).sort((a, b) => a.sd - b.sd)[ref.n - 1]
  } else {
    pick = others.filter((e) => e.sd < 0).sort((a, b) => b.sd - a.sd)[ref.n - 1]
  }
  return pick ? step(tiling, tile, pick.side) : null
}

// Follow a chain of refs from a starting tile/heading; only the FINAL tile is the destination (the
// intermediate tiles are passed through, not visited). null if any hop hits a boundary / dead ref.
export function resolveChain(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  tile: string,
  heading: number,
  movement: Movement,
  chain: ReadonlyArray<EdgeRef>,
): Hop {
  let cur: { tile: string; heading: number } = { tile, heading }
  for (const ref of chain) {
    const hop = resolveRef(tiling, overlay, cur.tile, cur.heading, movement, ref)
    if (!hop) return null
    cur = hop
  }
  return cur
}
