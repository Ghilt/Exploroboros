import { describe, it, expect } from 'vitest'
import { truncatedSquareTiling, neighborEdges, isBoundary } from '../index'

describe('truncated square tiling (4.8.8)', () => {
  it('mixes octagons and squares', () => {
    const t = truncatedSquareTiling(20)
    expect(t.meta.id).toBe('truncated-square')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('octagon')).toBe(true)
    expect(shapes.has('square')).toBe(true)
  })

  it('stitches edge-to-edge — an interior octagon has all 8 edges paired', () => {
    const t = truncatedSquareTiling(20)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'octagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(8)
  })

  it('an interior square has all 4 edges paired', () => {
    const t = truncatedSquareTiling(20)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'square').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('has a ragged border', () => {
    const t = truncatedSquareTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = truncatedSquareTiling(16)
    const b = truncatedSquareTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
