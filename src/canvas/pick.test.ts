import { describe, it, expect } from 'vitest'
import { pointInPolygon, representativeTileSize, pickTile, SpatialHash } from './pick'
import { squareTiling } from '../tiling'
import type { Tiling } from '../tiling'

const unitSquare = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

describe('pointInPolygon', () => {
  it('is true inside, false outside', () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, unitSquare)).toBe(true)
    expect(pointInPolygon({ x: 1.5, y: 0.5 }, unitSquare)).toBe(false)
    expect(pointInPolygon({ x: -0.1, y: 0.5 }, unitSquare)).toBe(false)
    expect(pointInPolygon({ x: 0.5, y: 2 }, unitSquare)).toBe(false)
  })
})

describe('representativeTileSize', () => {
  it('is the tile edge length for a unit square grid', () => {
    expect(representativeTileSize(squareTiling(4, 4))).toBeCloseTo(1)
  })
})

describe('pickTile — square fast path', () => {
  const t = squareTiling(3, 3)

  it('maps world points to sq:r,c', () => {
    expect(pickTile(t, { x: 0.5, y: 0.5 })).toBe('sq:0,0')
    expect(pickTile(t, { x: 1.5, y: 0.5 })).toBe('sq:0,1') // col 1, row 0
    expect(pickTile(t, { x: 0.5, y: 2.5 })).toBe('sq:2,0') // col 0, row 2
    expect(pickTile(t, { x: 2.9, y: 2.9 })).toBe('sq:2,2')
  })

  it('returns null outside the tiling bounds', () => {
    expect(pickTile(t, { x: -1, y: 0.5 })).toBeNull()
    expect(pickTile(t, { x: 0.5, y: 9 })).toBeNull()
  })
})

describe('pickTile — general spatial-hash path', () => {
  // Force the fallback by giving real square geometry a non-square meta id.
  const sq = squareTiling(2, 2)
  const t: Tiling = { ...sq, meta: { ...sq.meta, id: 'fake' } }

  it('finds the containing tile via the hash + point-in-polygon', () => {
    expect(pickTile(t, { x: 0.5, y: 0.5 })).toBe('sq:0,0')
    expect(pickTile(t, { x: 1.5, y: 1.5 })).toBe('sq:1,1')
    expect(pickTile(t, { x: 0.5, y: 1.5 })).toBe('sq:1,0')
  })

  it('SpatialHash.pick agrees and returns null in an empty cell region', () => {
    const hash = new SpatialHash(t)
    expect(hash.pick({ x: 1.5, y: 0.5 })).toBe('sq:0,1')
    expect(hash.pick({ x: 50, y: 50 })).toBeNull()
  })
})
