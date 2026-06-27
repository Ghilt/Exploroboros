import { describe, it, expect } from 'vitest'
import { kallebodaTiling, neighborEdges, uniqueNeighbors, isBoundary } from '../index'

describe('kalleboda (octagon + wedge) tiling', () => {
  it('builds without throwing and mixes octagons and wedges', () => {
    const t = kallebodaTiling(20)
    expect(t.meta.id).toBe('kalleboda')
    expect(t.nodes.length).toBeGreaterThan(50)
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('octagon')).toBe(true)
    expect(shapes.has('wedge')).toBe(true)
  })

  it('keeps the ~6:4 octagon:wedge ratio of the repeating cell', () => {
    const t = kallebodaTiling(30)
    const octs = t.nodes.filter((n) => n.shape === 'octagon').length
    const wedges = t.nodes.filter((n) => n.shape === 'wedge').length
    expect(octs / wedges).toBeGreaterThan(1.2)
    expect(octs / wedges).toBeLessThan(1.8)
  })

  it('stitches shared edges — an interior octagon has all 8 edges paired', () => {
    const t = kallebodaTiling(24)
    const maxEdges = Math.max(
      ...t.nodes.filter((n) => n.shape === 'octagon').map((n) => neighborEdges(t, n.id).length),
    )
    expect(maxEdges).toBe(8)
  })

  it('reproduces the two-edged-adjacency quirk (a neighbour shared by two edges)', () => {
    const t = kallebodaTiling(24)
    const twoEdge = t.nodes.some((n) => neighborEdges(t, n.id).length > uniqueNeighbors(t, n.id).length)
    expect(twoEdge).toBe(true)
  })

  it('has a ragged border — both boundary and interior edges exist', () => {
    const t = kallebodaTiling(16)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = kallebodaTiling(18)
    const b = kallebodaTiling(18)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
    expect(a.edges.length).toBe(b.edges.length)
  })
})
