import { describe, it, expect } from 'vitest'
import { rhombitrihexagonalTiling, neighborEdges, isBoundary } from '../index'

describe('rhombitrihexagonal tiling (3.4.6.4)', () => {
  it('mixes hexagons, squares and triangles', () => {
    const t = rhombitrihexagonalTiling(20)
    expect(t.meta.id).toBe('rhombitrihexagonal')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('hexagon')).toBe(true)
    expect(shapes.has('square')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('an interior hexagon has all 6 edges paired (one square each)', () => {
    const t = rhombitrihexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'hexagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(6)
  })

  it('an interior square has all 4 edges paired (2 hexagons + 2 triangles)', () => {
    const t = rhombitrihexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'square').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('an interior triangle has all 3 edges paired', () => {
    const t = rhombitrihexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'triangle').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(3)
  })

  it('has a ragged border', () => {
    const t = rhombitrihexagonalTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = rhombitrihexagonalTiling(16)
    const b = rhombitrihexagonalTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
