import { describe, it, expect } from 'vitest'
import { dodecagonHexTiling, neighborEdges, isBoundary } from '../index'

describe('dodecagon & hexagon tiling (3.4.6.12)', () => {
  it('mixes dodecagons, hexagons, squares and triangles', () => {
    const t = dodecagonHexTiling(20)
    expect(t.meta.id).toBe('dodecagon-hex')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('dodecagon')).toBe(true)
    expect(shapes.has('hexagon')).toBe(true)
    expect(shapes.has('square')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('an interior dodecagon has all 12 edges paired (6 hexagons + 6 squares)', () => {
    const t = dodecagonHexTiling(28)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'dodecagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(12)
  })

  it('an interior hexagon has all 6 edges paired', () => {
    const t = dodecagonHexTiling(28)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'hexagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(6)
  })

  it('an interior square has all 4 edges paired', () => {
    const t = dodecagonHexTiling(28)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'square').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('an interior triangle has all 3 edges paired', () => {
    const t = dodecagonHexTiling(28)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'triangle').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(3)
  })

  it('has a ragged border', () => {
    const t = dodecagonHexTiling(16)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = dodecagonHexTiling(18)
    const b = dodecagonHexTiling(18)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
