import { describe, it, expect } from 'vitest'
import { truncatedTrihexagonalTiling, neighborEdges, isBoundary } from '../index'

describe('truncated trihexagonal tiling (4.6.12)', () => {
  it('mixes dodecagons, hexagons and squares', () => {
    const t = truncatedTrihexagonalTiling(20)
    expect(t.meta.id).toBe('truncated-trihexagonal')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('dodecagon')).toBe(true)
    expect(shapes.has('hexagon')).toBe(true)
    expect(shapes.has('square')).toBe(true)
  })

  it('an interior dodecagon has all 12 edges paired (6 squares + 6 hexagons)', () => {
    const t = truncatedTrihexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'dodecagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(12)
  })

  it('an interior hexagon has all 6 edges paired (3 dodecagons + 3 squares)', () => {
    const t = truncatedTrihexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'hexagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(6)
  })

  it('an interior square has all 4 edges paired (2 dodecagons + 2 hexagons)', () => {
    const t = truncatedTrihexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'square').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('has a ragged border', () => {
    const t = truncatedTrihexagonalTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = truncatedTrihexagonalTiling(16)
    const b = truncatedTrihexagonalTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
