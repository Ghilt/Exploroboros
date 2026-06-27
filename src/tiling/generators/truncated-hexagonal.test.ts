import { describe, it, expect } from 'vitest'
import { truncatedHexagonalTiling, neighborEdges } from '../index'

describe('truncated hexagonal tiling (3.12.12)', () => {
  it('mixes dodecagons and triangles', () => {
    const t = truncatedHexagonalTiling(20)
    expect(t.meta.id).toBe('truncated-hexagonal')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('dodecagon')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('an interior dodecagon has all 12 edges paired (6 dodecagons + 6 triangles)', () => {
    const t = truncatedHexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'dodecagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(12)
  })

  it('an interior triangle has all 3 edges paired', () => {
    const t = truncatedHexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'triangle').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(3)
  })

  it('has ~2 triangles per dodecagon', () => {
    const t = truncatedHexagonalTiling(30)
    const dod = t.nodes.filter((n) => n.shape === 'dodecagon').length
    const tri = t.nodes.filter((n) => n.shape === 'triangle').length
    expect(tri / dod).toBeGreaterThan(1.5)
    expect(tri / dod).toBeLessThan(2.5)
  })

  it('is deterministic', () => {
    const a = truncatedHexagonalTiling(16)
    const b = truncatedHexagonalTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
