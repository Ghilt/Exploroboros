import { describe, it, expect } from 'vitest'
import { buildTiling, addVisit, tileState, visitCount, type TileState } from '../canvas'
import { across, nodeById, localSideToEdge, type Tiling } from '../tiling'
import { parseProgram, rotateHeading, stepTraversers, type Program, type Traverser } from './index'

// The built-in "Walker" behaviour expressed in the DSL: step to the least-turn unvisited neighbour.
const WALKER: Program = (() => {
  const r = parseProgram('move nearest-unvisited')
  if (!r.ok) throw new Error(r.error.message)
  return r.value
})()
const defs = new Map([['walker', WALKER]])

// A 3x3 square grid: the centre tile has all four neighbours, the corners two each.
const tiling: Tiling = buildTiling('square', 3)
const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i] as const))

// heading is an EDGE NUMBER now. Build a Walker traverser aimed at a given edge.
function mk(id: string, tile: string, heading: number): Traverser {
  return { id, tile, heading, def: 'walker', steps: 0, splits: 0, maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 }
}

function at(a: number, b: number): string {
  const n = tiling.nodes.find((t) => t.lattice[0] === a && t.lattice[1] === b)
  if (!n) throw new Error(`no tile at ${a},${b}`)
  return n.id
}

// The EDGE NUMBER on `from` whose side leads to adjacent tile `to` — so a walker aimed there steps
// straight onto `to` (zero turn).
function edgeToward(from: string, to: string): number {
  const node = nodeById(tiling, from)!
  for (const side of node.sides) {
    const end = across(tiling, from, side.geometry.localIndex)
    if (end && end.tile === to) return localSideToEdge(node, side.geometry.localIndex)
  }
  throw new Error(`${from} is not adjacent to ${to}`)
}

const center = () => at(1, 1)

describe('rotateHeading (edge-number ring arithmetic)', () => {
  it('steps +1 clockwise, a 4-cycle on a square', () => {
    const tile = center()
    let h = 0
    const seen = [h]
    for (let i = 0; i < 4; i += 1) {
      h = rotateHeading(tiling, tile, h, 1)
      seen.push(h)
    }
    expect(h).toBe(0) // four right-steps return to the start
    expect(new Set(seen.slice(0, 4)).size).toBe(4) // visited edges 0,1,2,3
  })
  it('reverses with dir -1', () => {
    const right = rotateHeading(tiling, center(), 0, 1)
    expect(rotateHeading(tiling, center(), right, -1)).toBe(0)
  })
  it('leaves an unknown tile unchanged', () => {
    expect(rotateHeading(tiling, 'nope', 2, 1)).toBe(2)
  })
})

describe('stepTraversers (DSL-driven, default "Walker" = move unvisited)', () => {
  const state = (traversers: Traverser[], overlay: ReadonlyMap<string, TileState>, step: number) => ({
    tiling,
    overlay,
    traversers,
    step,
    defs,
    indexById,
  })

  it('moves a walker, re-aims it, and stamps the visit with the new step', () => {
    const target = at(0, 1)
    const walker = mk('w', center(), edgeToward(center(), target))
    const result = stepTraversers(state([walker], new Map(), 5))

    expect(result.step).toBe(6)
    expect(result.traversers).toHaveLength(1)
    expect(result.traversers[0]).toMatchObject({ id: 'w', tile: target, steps: 1 })
    expect(tileState(result.overlay, target).visits).toEqual([6])
  })

  it('skips a visited neighbour and turns to the next-best unvisited one', () => {
    const blocked = at(0, 1)
    const overlay = addVisit(new Map<string, TileState>(), blocked, 0)
    const result = stepTraversers(state([mk('w', center(), edgeToward(center(), blocked))], overlay, 0))
    expect(result.traversers).toHaveLength(1)
    expect(result.traversers[0].tile).not.toBe(blocked)
    expect([at(1, 0), at(1, 2)]).toContain(result.traversers[0].tile) // a side neighbour, not the far one
  })

  it('coalesces identical walkers (same def, tile, heading, registers) to one', () => {
    const target = at(0, 1)
    const h = edgeToward(center(), target)
    const result = stepTraversers(state([mk('a', center(), h), mk('b', center(), h)], new Map(), 0))

    expect(result.traversers).toHaveLength(1)
    expect(result.traversers[0].id).toBe('a')
    expect(visitCount(tileState(result.overlay, target))).toBe(1)
  })

  it('keeps walkers arriving on a tile from different directions distinct, but records one visit', () => {
    const shared = at(0, 1)
    const a = mk('a', at(0, 0), edgeToward(at(0, 0), shared))
    const b = mk('b', at(0, 2), edgeToward(at(0, 2), shared))
    const result = stepTraversers(state([a, b], new Map(), 0))

    expect(result.traversers).toHaveLength(2) // different entry edges -> different arrival heading
    expect(result.traversers.every((t) => t.tile === shared)).toBe(true)
    expect(visitCount(tileState(result.overlay, shared))).toBe(1)
  })

  it('drops a trapped walker and still advances the step', () => {
    let overlay = new Map<string, TileState>()
    for (const id of [at(0, 1), at(2, 1), at(1, 0), at(1, 2)]) overlay = addVisit(overlay, id, 0)
    const result = stepTraversers(state([mk('w', center(), 0)], overlay, 3))

    expect(result.traversers).toHaveLength(0)
    expect(result.step).toBe(4)
  })

  it('is deterministic — same input, same output', () => {
    const walker = mk('w', center(), edgeToward(center(), at(2, 1)))
    const s = state([walker], new Map(), 0)
    const r1 = stepTraversers(s)
    const r2 = stepTraversers(s)
    expect(r1.traversers).toEqual(r2.traversers)
    expect([...r1.overlay]).toEqual([...r2.overlay])
  })
})
