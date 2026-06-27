import { describe, it, expect } from 'vitest'
import { buildTiling, addVisit, tileState, visitCount, type TileState } from '../canvas'
import { across, nodeById, type Tiling } from '../tiling'
import { chooseMove, headingOptions, rotateHeading, stepTraversers, type Traverser } from './index'

// A 3x3 square grid: the centre tile has all four neighbours, the corners two each — enough to
// exercise least-turn choice, traversal, trapping, and coalescing without orientation assumptions.
const tiling: Tiling = buildTiling('square', 3)

// The tile at lattice [a, b] (square lattice is two coords; row/col order doesn't matter here).
function at(a: number, b: number): string {
  const n = tiling.nodes.find((t) => t.lattice[0] === a && t.lattice[1] === b)
  if (!n) throw new Error(`no tile at ${a},${b}`)
  return n.id
}

// The exact heading that points from `from` straight at adjacent tile `to` (the shared side's
// outward normal) — so chooseMove sees a zero turn toward `to`.
function headingToward(from: string, to: string): number {
  const node = nodeById(tiling, from)!
  for (const side of node.sides) {
    const end = across(tiling, from, side.geometry.localIndex)
    if (end && end.tile === to) return side.geometry.normalAngle
  }
  throw new Error(`${from} is not adjacent to ${to}`)
}

const center = () => at(1, 1)

describe('headingOptions', () => {
  it('gives one direction per side (4 for a square interior tile)', () => {
    expect(headingOptions(tiling, center())).toHaveLength(4)
  })
  it('is empty for an unknown tile', () => {
    expect(headingOptions(tiling, 'nope')).toEqual([])
  })
})

describe('rotateHeading', () => {
  it('steps through the tile edge directions and is a 4-step cycle on a square', () => {
    const tile = center()
    const opts = headingOptions(tiling, tile)
    let h = opts[0]
    const seen = [h]
    for (let i = 0; i < 4; i += 1) {
      h = rotateHeading(tiling, tile, h, 1)
      seen.push(h)
    }
    // four right-steps return to the start; the four distinct edge directions were visited
    expect(h).toBeCloseTo(opts[0])
    expect(new Set(seen.slice(0, 4).map((a) => a.toFixed(4))).size).toBe(4)
  })
  it('reverses with dir -1', () => {
    const tile = center()
    const opts = headingOptions(tiling, tile)
    const right = rotateHeading(tiling, tile, opts[0], 1)
    expect(rotateHeading(tiling, tile, right, -1)).toBeCloseTo(opts[0])
  })
})

describe('chooseMove', () => {
  it('takes the neighbour the heading points straight at (zero turn)', () => {
    const target = at(0, 1)
    const move = chooseMove(tiling, new Map(), center(), headingToward(center(), target))
    expect(move).not.toBeNull()
    expect(move!.tile).toBe(target)
    // new heading = the crossed edge's normal (points the way it travelled)
    expect(move!.heading).toBeCloseTo(headingToward(center(), target))
  })

  it('skips a visited neighbour and turns to the next-best unvisited one', () => {
    const blocked = at(0, 1)
    const overlay = addVisit(new Map<string, TileState>(), blocked, 0)
    const move = chooseMove(tiling, overlay, center(), headingToward(center(), blocked))
    expect(move).not.toBeNull()
    expect(move!.tile).not.toBe(blocked)
    // the opposite tile is the worst turn (π); it should pick a side neighbour instead
    expect([at(1, 0), at(1, 2)]).toContain(move!.tile)
  })

  it('returns null when every neighbour is already visited (trapped)', () => {
    let overlay = new Map<string, TileState>()
    for (const id of [at(0, 1), at(2, 1), at(1, 0), at(1, 2)]) overlay = addVisit(overlay, id, 0)
    expect(chooseMove(tiling, overlay, center(), 0)).toBeNull()
  })
})

describe('stepTraversers', () => {
  it('moves a walker, re-aims it, and stamps the visit with the new step', () => {
    const target = at(0, 1)
    const walker: Traverser = { id: 'w', tile: center(), heading: headingToward(center(), target) }
    const result = stepTraversers({ tiling, overlay: new Map(), traversers: [walker], step: 5 })

    expect(result.step).toBe(6)
    expect(result.traversers).toHaveLength(1)
    expect(result.traversers[0]).toMatchObject({ id: 'w', tile: target })
    expect(tileState(result.overlay, target).visits).toEqual([6])
  })

  it('coalesces two walkers landing on the same tile to one, with a single visit', () => {
    const shared = at(0, 1)
    const a: Traverser = { id: 'a', tile: at(0, 0), heading: headingToward(at(0, 0), shared) }
    const b: Traverser = { id: 'b', tile: at(0, 2), heading: headingToward(at(0, 2), shared) }
    const result = stepTraversers({ tiling, overlay: new Map(), traversers: [a, b], step: 0 })

    expect(result.traversers).toHaveLength(1)
    expect(result.traversers[0].id).toBe('a') // first in array order wins the tile
    expect(result.traversers[0].tile).toBe(shared)
    expect(visitCount(tileState(result.overlay, shared))).toBe(1)
  })

  it('drops a trapped walker and still advances the step', () => {
    let overlay = new Map<string, TileState>()
    for (const id of [at(0, 1), at(2, 1), at(1, 0), at(1, 2)]) overlay = addVisit(overlay, id, 0)
    const walker: Traverser = { id: 'w', tile: center(), heading: 0 }
    const result = stepTraversers({ tiling, overlay, traversers: [walker], step: 3 })

    expect(result.traversers).toHaveLength(0)
    expect(result.step).toBe(4)
  })

  it('is deterministic — same input, same output', () => {
    const target = at(2, 1)
    const walker: Traverser = { id: 'w', tile: center(), heading: headingToward(center(), target) }
    const state = { tiling, overlay: new Map<string, TileState>(), traversers: [walker], step: 0 }
    const r1 = stepTraversers(state)
    const r2 = stepTraversers(state)
    expect(r1.traversers).toEqual(r2.traversers)
    expect([...r1.overlay]).toEqual([...r2.overlay])
  })
})
