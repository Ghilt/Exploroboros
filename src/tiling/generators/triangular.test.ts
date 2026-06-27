import { describe, it, expect } from 'vitest'
import { triangularTiling, neighborEdges, isBoundary } from '../index'

describe('triangular tiling', () => {
  it('builds equilateral triangles', () => {
    const t = triangularTiling(20)
    expect(t.meta.id).toBe('triangular')
    expect(t.nodes.length).toBeGreaterThan(50)
    expect(t.nodes.every((n) => n.shape === 'triangle')).toBe(true)
    expect(t.nodes.every((n) => n.vertices.length === 3)).toBe(true)
  })

  it('stitches edge-to-edge — an interior triangle has all 3 edges paired', () => {
    const t = triangularTiling(20)
    const maxEdges = Math.max(...t.nodes.map((n) => neighborEdges(t, n.id).length))
    expect(maxEdges).toBe(3)
  })

  it('has a ragged border', () => {
    const t = triangularTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = triangularTiling(16)
    const b = triangularTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
