import { describe, it, expect } from 'vitest'
import { trihexagonalTiling, neighborEdges } from '../index'

describe('trihexagonal tiling (3.6.3.6)', () => {
  it('mixes hexagons and triangles', () => {
    const t = trihexagonalTiling(20)
    expect(t.meta.id).toBe('trihexagonal')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('hexagon')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('stitches edge-to-edge — an interior hexagon has all 6 edges paired', () => {
    const t = trihexagonalTiling(20)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'hexagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(6)
  })

  it('an interior triangle has all 3 edges paired', () => {
    const t = trihexagonalTiling(20)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'triangle').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(3)
  })

  it('has ~2 triangles per hexagon', () => {
    const t = trihexagonalTiling(30)
    const hex = t.nodes.filter((n) => n.shape === 'hexagon').length
    const tri = t.nodes.filter((n) => n.shape === 'triangle').length
    expect(tri / hex).toBeGreaterThan(1.5)
    expect(tri / hex).toBeLessThan(2.5)
  })

  it('is deterministic', () => {
    const a = trihexagonalTiling(16)
    const b = trihexagonalTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
