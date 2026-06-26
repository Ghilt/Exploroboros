import { describe, it, expect } from 'vitest'
import { stitch } from './stitch'
import { makeShapeDef, SQUARE } from './shapes'
import { squareTiling } from './generators/square'
import { across, opposite, isBoundary } from './graph'
import type { RawTile, TilingMeta } from './types'

const meta = (id: string): TilingMeta => ({ id, name: id, vertexConfig: '-', chiral: false, edgeToEdge: true })

describe('stitch beyond squares (two triangles sharing an edge)', () => {
  const TRI = makeShapeDef('triangle', 3)
  // Two CCW right triangles splitting the unit square along its diagonal.
  const triPair = () =>
    stitch(
      [
        { id: 'a', shape: 'triangle', lattice: [0], vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
        { id: 'b', shape: 'triangle', lattice: [1], vertices: [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
      ],
      { triangle: TRI },
      meta('tri-pair'),
    )

  it('finds the shared edge: 1 interior + 4 boundary = 5 edges', () => {
    const t = triPair()
    expect(t.nodes.length).toBe(2)
    expect(t.edges.length).toBe(5)
    expect(t.edges.filter(isBoundary).length).toBe(4)
  })

  it('reciprocity holds across the shared (hypotenuse) edge', () => {
    const t = triPair()
    const end = across(t, 'a', 1) // side 1 of triangle a is the hypotenuse (1,0)->(0,1)
    expect(end).not.toBeNull()
    if (!end) throw new Error('expected an interior edge')
    expect(across(t, end.tile, end.side)).toEqual({ tile: 'a', side: 1 })
  })

  it('odd-sided opposite flows through the engine (a triangle side has TWO opposites)', () => {
    expect(opposite(triPair(), 'a', 0)).toEqual([1, 2])
  })

  it('throws on an out-of-range side', () => {
    expect(() => opposite(triPair(), 'a', 9)).toThrow()
  })
})

describe('stitch guards', () => {
  it('rejects a clockwise-wound tile', () => {
    const cw: RawTile = {
      id: 'cw',
      shape: 'square',
      lattice: [0, 0],
      vertices: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }],
    }
    expect(() => stitch([cw], { square: SQUARE }, meta('cw'))).toThrow(/counter-clockwise|CCW/)
  })

  it('rejects duplicate tile ids', () => {
    const sq = (x: number): RawTile => ({
      id: 'dup',
      shape: 'square',
      lattice: [0, x],
      vertices: [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }, { x, y: 1 }],
    })
    expect(() => stitch([sq(0), sq(5)], { square: SQUARE }, meta('dup'))).toThrow(/duplicate tile id/)
  })
})

describe('Tiling round-trips through JSON (the SSR-caching claim)', () => {
  it('preserves shapes and queries after stringify/parse', () => {
    const t = squareTiling(3, 3)
    const round = JSON.parse(JSON.stringify(t)) as typeof t
    expect(round.nodes.length).toBe(9)
    expect(round.edges.length).toBe(t.edges.length)
    expect(round.shapes.square.oppositeSides).toEqual([[2], [3], [0], [1]])
    expect(opposite(round, 'sq:1,1', 0)).toEqual([2]) // would throw if shapes were a dropped Map
  })
})
