import { describe, it, expect } from 'vitest'
import { squareTiling, kallebodaTiling, opposite, across } from '../../tiling'
import { addVisits, type TileState } from '../../canvas'
import { resolveRef, resolveChain } from './edges'

// 5x5 squares. Tile (r,c) id `sq:r,c`. Heading 0 = east (a side's normalAngle convention). From a
// middle tile heading east: straight = east neighbour, r1 = south (clockwise/right), l1 = north.
const tiling = squareTiling(5, 5)
const empty: ReadonlyMap<string, TileState> = new Map()
const EAST = 0

describe('edge shorthand resolution (square, heading east)', () => {
  it('straight steps to the east neighbour', () => {
    const hop = resolveRef(tiling, empty, 'sq:2,2', EAST, 'relative', { kind: 'straight' })
    expect(hop?.tile).toBe('sq:2,3')
  })

  it('r1 turns right (south), l1 turns left (north)', () => {
    expect(resolveRef(tiling, empty, 'sq:2,2', EAST, 'relative', { kind: 'turn', dir: 'r', n: 1 })?.tile).toBe('sq:1,2')
    expect(resolveRef(tiling, empty, 'sq:2,2', EAST, 'relative', { kind: 'turn', dir: 'l', n: 1 })?.tile).toBe('sq:3,2')
  })

  it('edge 0 is the north (top) edge regardless of heading', () => {
    expect(resolveRef(tiling, empty, 'sq:2,2', EAST, 'relative', { kind: 'edge', index: 0 })?.tile).toBe('sq:3,2')
  })

  it('returns null at a boundary', () => {
    expect(resolveRef(tiling, empty, 'sq:2,4', EAST, 'relative', { kind: 'straight' })).toBeNull()
  })

  it('absolute movement ignores the heading (straight = north/top)', () => {
    const hop = resolveRef(tiling, empty, 'sq:2,2', EAST, 'absolute', { kind: 'straight' })
    expect(hop?.tile).toBe('sq:3,2')
  })

  it('unvisited picks the least-turn unvisited neighbour, skipping visited ones', () => {
    expect(resolveRef(tiling, empty, 'sq:2,2', EAST, 'relative', { kind: 'unvisited' })?.tile).toBe('sq:2,3')
    const overlay = addVisits(empty, ['sq:2,3'], 0)
    // east now visited; the next least turn ties between north & south, broken to the earlier
    // clockwise edge (north).
    expect(resolveRef(tiling, overlay, 'sq:2,2', EAST, 'relative', { kind: 'unvisited' })?.tile).toBe('sq:3,2')
  })

  it('a chain hops twice, landing two tiles away', () => {
    const hop = resolveChain(tiling, empty, 'sq:2,2', EAST, 'relative', [{ kind: 'straight' }, { kind: 'straight' }])
    expect(hop?.tile).toBe('sq:2,4')
  })
})

// The concave wedge declares its own straight-through pairing (oppositeSides), so on a wedge
// `move straight` exits the edge OPPOSITE the one entered — not the least-turn-from-heading edge a
// regular tile would use. Entering through local side e means the heading (direction of travel)
// points into the tile across e, i.e. e's outward normal reversed.
describe('edge shorthand resolution (wedge — straight = opposite the entry edge)', () => {
  const t = kallebodaTiling(20)
  // An interior wedge: every side leads to a neighbour, so opposite(e) is never a boundary.
  const wedge = t.nodes.find(
    (n) => n.shape === 'wedge' && n.sides.every((s) => across(t, n.id, s.geometry.localIndex)),
  )

  it('found an interior wedge to test', () => {
    expect(wedge).toBeDefined()
  })

  it('straight steps across the opposite edge for every entry side', () => {
    for (let e = 0; e < wedge!.sides.length; e += 1) {
      const heading = wedge!.sides[e].geometry.normalAngle + Math.PI // entered through side e
      const opp = opposite(t, wedge!.id, e)[0]
      const hop = resolveRef(t, empty, wedge!.id, heading, 'relative', { kind: 'straight' })
      expect(hop?.tile).toBe(across(t, wedge!.id, opp)!.tile)
    }
  })

  it('absolute movement ignores the entry edge (heading-independent, pairing not applied)', () => {
    // Absolute straight is the north-most edge regardless of heading, so two different entry edges
    // must give the SAME straight tile. (A relative straight would differ — that is the whole point
    // of the pairing — so this proves absolute mode is untouched.)
    const h1 = wedge!.sides[0].geometry.normalAngle + Math.PI
    const h2 = wedge!.sides[3].geometry.normalAngle + Math.PI
    const a = resolveRef(t, empty, wedge!.id, h1, 'absolute', { kind: 'straight' })
    const b = resolveRef(t, empty, wedge!.id, h2, 'absolute', { kind: 'straight' })
    expect(a?.tile).toBe(b?.tile)
  })
})
