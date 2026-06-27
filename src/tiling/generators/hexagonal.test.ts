import { describe, it, expect } from 'vitest'
import { hexagonalTiling, neighborEdges, isBoundary } from '../index'

describe('hexagonal tiling', () => {
  it('builds regular hexagons', () => {
    const t = hexagonalTiling(20)
    expect(t.meta.id).toBe('hexagonal')
    expect(t.nodes.length).toBeGreaterThan(40)
    expect(t.nodes.every((n) => n.shape === 'hexagon')).toBe(true)
    expect(t.nodes.every((n) => n.vertices.length === 6)).toBe(true)
  })

  it('stitches edge-to-edge — an interior hexagon has all 6 edges paired (weld worked)', () => {
    const t = hexagonalTiling(20)
    const maxEdges = Math.max(...t.nodes.map((n) => neighborEdges(t, n.id).length))
    expect(maxEdges).toBe(6)
  })

  it('has a ragged border', () => {
    const t = hexagonalTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = hexagonalTiling(16)
    const b = hexagonalTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
