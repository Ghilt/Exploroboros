// The basic traverser + the synchronous tick. One hardcoded behaviour for now: a walker steps to
// the adjacent UNVISITED tile that best continues its heading (least turn), then re-aims along the
// edge it crossed. The custom-rule (DSL) engine slots in later behind this same step() shape.
//
// A tick is synchronous (CLAUDE.md §5): read the frozen overlay, compute every walker's move off
// it, then apply all the visits at once and rebuild the walker set. So no walker sees another's
// move mid-tick, and two walkers landing on the same tile coalesce to one (the anti-blowup rule).

import type { Tiling } from '../tiling'
import { nodeById, across, clockwiseEdgeOrder } from '../tiling'
import { tileState, visitCount, addVisits, type TileState } from '../canvas'
import type { Traverser, TraverseState, TickResult } from './types'

const TWO_PI = Math.PI * 2

// Smallest absolute angle between two headings (radians), in [0, π].
function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % TWO_PI
  if (d > Math.PI) d = TWO_PI - d
  return d
}

// A tile's outward edge directions (radians), ordered clockwise from the top — the discrete
// headings a walker can take from here. Drives the placement default and the Inspect rotate
// controls; the order is the user-facing clockwise edge order, so rotating feels like "turn right".
export function headingOptions(tiling: Tiling, tile: string): number[] {
  const node = nodeById(tiling, tile)
  if (!node) return []
  return clockwiseEdgeOrder(node).map((side) => node.sides[side].geometry.normalAngle)
}

// The next heading when the user rotates the head: snap to the tile's nearest edge direction, then
// step one edge clockwise (dir +1, "turn right") or counter-clockwise (dir -1). Returns `heading`
// unchanged for a tile with no edges. Lets the Inspect rotate buttons cycle real exit directions.
export function rotateHeading(tiling: Tiling, tile: string, heading: number, dir: 1 | -1): number {
  const options = headingOptions(tiling, tile)
  if (options.length === 0) return heading
  let nearest = 0
  for (let i = 1; i < options.length; i += 1) {
    if (angleDiff(options[i], heading) < angleDiff(options[nearest], heading)) nearest = i
  }
  return options[(nearest + dir + options.length) % options.length]
}

// Among the sides leading to an UNVISITED neighbour, the one whose outward normal is the least turn
// from `heading`. Returns that neighbour + the new heading (the exit edge's normal), or null when
// every neighbour is visited (the walker is trapped). Deterministic: ties go to the earlier edge in
// clockwise-from-top order.
export function chooseMove(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  tile: string,
  heading: number,
): { tile: string; heading: number } | null {
  const node = nodeById(tiling, tile)
  if (!node) return null
  let best: { tile: string; heading: number; turn: number } | null = null
  for (const side of clockwiseEdgeOrder(node)) {
    const end = across(tiling, tile, side)
    if (!end) continue // boundary edge
    if (visitCount(tileState(overlay, end.tile)) > 0) continue // already visited
    const normal = node.sides[side].geometry.normalAngle
    const turn = angleDiff(heading, normal)
    if (!best || turn < best.turn - 1e-9) best = { tile: end.tile, heading: normal, turn }
  }
  return best ? { tile: best.tile, heading: best.heading } : null
}

// Advance one tick. Trapped walkers drop; walkers targeting the same tile coalesce to the first
// (in array order); one visit per distinct target is stamped with the new step number.
export function stepTraversers(state: TraverseState): TickResult {
  const { tiling, overlay, traversers, step } = state
  const nextStep = step + 1
  const claimed = new Set<string>()
  const next: Traverser[] = []
  for (const tr of traversers) {
    const move = chooseMove(tiling, overlay, tr.tile, tr.heading)
    if (!move) continue // trapped -> drop
    if (claimed.has(move.tile)) continue // another walker already took this tile -> coalesce
    claimed.add(move.tile)
    next.push({ ...tr, tile: move.tile, heading: move.heading })
  }
  return { overlay: addVisits(overlay, [...claimed], nextStep), traversers: next, step: nextStep }
}
