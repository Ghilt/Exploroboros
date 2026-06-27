import { describe, it, expect } from 'vitest'
import { snubHexagonalTiling, nodeById, neighborEdges, uniqueNeighbors, isBoundary } from '../index'

describe('snub hexagonal tiling (3.3.3.3.6)', () => {
  it('mixes hexagons and triangles', () => {
    const t = snubHexagonalTiling(20)
    expect(t.meta.id).toBe('snub-hexagonal')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('hexagon')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('an interior hexagon has all 6 edges paired, and every neighbour is a triangle', () => {
    const t = snubHexagonalTiling(24)
    const hexes = t.nodes.filter((n) => n.shape === 'hexagon')
    const fully = hexes.filter((h) => neighborEdges(t, h.id).length === 6)
    expect(fully.length).toBeGreaterThan(0)
    for (const h of fully) {
      for (const id of uniqueNeighbors(t, h.id)) {
        expect(nodeById(t, id)?.shape).toBe('triangle')
      }
    }
  })

  it('an interior triangle has all 3 edges paired', () => {
    const t = snubHexagonalTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'triangle').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(3)
  })

  it('has roughly eight triangles per hexagon', () => {
    const t = snubHexagonalTiling(30)
    const hex = t.nodes.filter((n) => n.shape === 'hexagon').length
    const tri = t.nodes.filter((n) => n.shape === 'triangle').length
    // Interior ratio is 8:1; boundary trimming pulls the finite-patch ratio a bit higher.
    expect(tri / hex).toBeGreaterThan(7)
    expect(tri / hex).toBeLessThan(10)
  })

  it('has a ragged border', () => {
    const t = snubHexagonalTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = snubHexagonalTiling(16)
    const b = snubHexagonalTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
