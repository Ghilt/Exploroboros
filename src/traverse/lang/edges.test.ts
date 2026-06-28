import { describe, it, expect } from 'vitest'
import { squareTiling } from '../../tiling'
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
