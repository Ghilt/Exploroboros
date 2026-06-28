import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import { nodeById } from '../tiling'
import { boundsCenter, tileOffset, placeOffset } from './remap'

describe('remap', () => {
  it('the centre tile has ~zero offset, and placing zero lands back on it', () => {
    const t = buildTiling('square', 5) // bounds [0,5]², centre (2.5,2.5) → tile sq:2,2
    const off = tileOffset(t, 'sq:2,2')!
    expect(off.x).toBeCloseTo(0)
    expect(off.y).toBeCloseTo(0)
    expect(placeOffset(t, off)).toBe('sq:2,2')
  })

  it('offset → place round-trips for an off-centre tile on the same grid', () => {
    const t = buildTiling('square', 6)
    for (const id of ['sq:0,0', 'sq:1,4', 'sq:5,5', 'sq:3,2']) {
      expect(placeOffset(t, tileOffset(t, id)!)).toBe(id)
    }
  })

  it('a centre-relative offset carries across grid sizes (centred stays centred)', () => {
    const small = buildTiling('square', 5)
    const big = buildTiling('square', 21) // centre (10.5,10.5) → sq:10,10
    const centreOffset = tileOffset(small, 'sq:2,2')! // ≈ (0,0)
    expect(placeOffset(big, centreOffset)).toBe('sq:10,10')
    // one tile to the right of centre on the small grid maps one tile right of centre on the big grid
    const rightOffset = tileOffset(small, 'sq:2,3')!
    const placed = placeOffset(big, rightOffset)!
    const node = nodeById(big, placed)!
    expect(node.centroid.x).toBeGreaterThan(boundsCenter(big).x)
    expect(node.centroid.y).toBeCloseTo(boundsCenter(big).y)
  })

  it('prefers the same shape class on a multi-shape tiling', () => {
    const t = buildTiling('truncated-square', 12) // squares + octagons
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.size).toBeGreaterThan(1)
    // for one node of each shape, placing its offset constrained to that shape returns that shape
    for (const shape of shapes) {
      const node = t.nodes.find((n) => n.shape === shape)!
      const placed = placeOffset(t, tileOffset(t, node.id)!, shape)!
      expect(nodeById(t, placed)!.shape).toBe(shape)
    }
  })

  it('returns null offset for an unknown tile id', () => {
    expect(tileOffset(buildTiling('square', 3), 'nope')).toBeNull()
  })
})
