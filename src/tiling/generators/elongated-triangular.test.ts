import { describe, it, expect } from 'vitest'
import { elongatedTriangularTiling, neighborEdges, isBoundary } from '../index'

describe('elongated triangular tiling (3.3.3.4.4)', () => {
  it('mixes squares and triangles', () => {
    const t = elongatedTriangularTiling(20)
    expect(t.meta.id).toBe('elongated-triangular')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('square')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('an interior square has all 4 edges paired', () => {
    const t = elongatedTriangularTiling(20)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'square').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('an interior triangle has all 3 edges paired', () => {
    const t = elongatedTriangularTiling(20)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'triangle').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(3)
  })

  it('has a ragged border', () => {
    const t = elongatedTriangularTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = elongatedTriangularTiling(16)
    const b = elongatedTriangularTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
