// The synchronous tick, now DSL-driven: each walker runs its definition's compiled program against
// the FROZEN overlay (read all, then write all), producing branches + tile-registry writes. Branches
// are coalesced (identical state merges — the anti-blowup rule), tile writes + visits are applied,
// over-age walkers (max-steps) are dropped, and the step counter advances. chooseMove/headingOptions/
// rotateHeading remain for the Inspect aim controls and the built-in `unvisited` move.

import type { Tiling } from '../tiling'
import { nodeById, across, clockwiseEdgeOrder } from '../tiling'
import { tileState, visitCount, addVisits, applyRegistryWrites, type TileState, type RegWrite } from '../canvas'
import { runProgram, type TileWrite, type WalkerState } from './lang'
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

// Advance one tick. Each walker runs its program off the frozen overlay; a walker that produces no
// move/morph is dropped (it only persists by moving). Branches inherit the parent's registers/steps
// (branch 0 keeps the id, extras get fresh ids; splits++ on a real split). Identical branches —
// same def, tile, heading and P/Q/R — coalesce to bound branching. Then tile-registry writes apply
// (in order), one visit per destination tile is stamped at the new step, and over-age walkers drop.
export function stepTraversers(state: TraverseState): TickResult {
  const { tiling, overlay, traversers, step, defs, indexById } = state
  const nextStep = step + 1
  const tileByIndex = tiling.nodes.map((n) => n.id)

  const spawned: Traverser[] = []
  const tileWrites: RegWrite[] = []
  for (const tr of traversers) {
    const program = defs.get(tr.def)
    if (!program) continue // unknown definition -> can't act -> drop
    const walker: WalkerState = {
      tile: tr.tile,
      heading: tr.heading,
      steps: tr.steps,
      splits: tr.splits,
      maxSplit: tr.maxSplit,
      maxSteps: tr.maxSteps,
      movement: tr.movement,
      p: tr.p,
      q: tr.q,
      r: tr.r,
    }
    const res = runProgram({ tiling, overlay, indexById, tileByIndex, walker, program })
    for (const w of res.tileWrites as TileWrite[]) tileWrites.push(w)
    const split = res.branches.length > 1
    res.branches.forEach((b, i) => {
      spawned.push({
        id: i === 0 ? tr.id : `${tr.id}.${i}`,
        tile: b.tile,
        heading: b.heading,
        def: b.morphDef ?? tr.def,
        steps: tr.steps + 1,
        splits: tr.splits + (split ? 1 : 0),
        maxSplit: res.next.maxSplit,
        maxSteps: res.next.maxSteps,
        movement: res.next.movement,
        p: res.next.p,
        q: res.next.q,
        r: res.next.r,
      })
    })
  }

  // Coalesce identical branches; then drop walkers past their max-steps.
  const seen = new Set<string>()
  const next: Traverser[] = []
  for (const b of spawned) {
    const key = `${b.def}|${b.tile}|${Math.round(b.heading * 1000)}|${b.p}|${b.q}|${b.r}`
    if (seen.has(key)) continue
    seen.add(key)
    if (b.steps > b.maxSteps) continue
    next.push(b)
  }

  let nextOverlay = applyRegistryWrites(overlay, tileWrites)
  const destinations = [...new Set(next.map((b) => b.tile))]
  nextOverlay = addVisits(nextOverlay, destinations, nextStep)
  return { overlay: nextOverlay, traversers: next, step: nextStep }
}
