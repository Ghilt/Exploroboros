import { describe, it, expect } from 'vitest'
import { kagomeSquareTiling, neighborEdges, isBoundary } from '../index'

describe('kagome & squares tiling (3.4.4.6; 3.6.3.6)', () => {
  it('mixes hexagons, squares and triangles', () => {
    const t = kagomeSquareTiling(20)
    expect(t.meta.id).toBe('kagome-square')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('hexagon')).toBe(true)
    expect(shapes.has('square')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('an interior hexagon has all 6 edges paired (2 squares + 4 triangles)', () => {
    const t = kagomeSquareTiling(26)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'hexagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(6)
  })

  it('an interior square has all 4 edges paired', () => {
    const t = kagomeSquareTiling(26)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'square').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('an interior triangle has all 3 edges paired (1 square + 2 hexagons)', () => {
    const t = kagomeSquareTiling(26)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'triangle').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(3)
  })

  it('has a ragged border', () => {
    const t = kagomeSquareTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = kagomeSquareTiling(16)
    const b = kagomeSquareTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
