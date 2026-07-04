import { describe, it, expect } from 'vitest'
import { dodecagonSquareTiling, neighborEdges, isBoundary } from '../index'

describe('dodecagon & square tiling (3.4.3.12)', () => {
  it('mixes dodecagons, squares and triangles', () => {
    const t = dodecagonSquareTiling(20)
    expect(t.meta.id).toBe('dodecagon-square')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('dodecagon')).toBe(true)
    expect(shapes.has('square')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('an interior dodecagon has all 12 edges paired (4 dodecagons + 8 triangles)', () => {
    const t = dodecagonSquareTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'dodecagon').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(12)
  })

  it('an interior square has all 4 edges paired (4 triangles)', () => {
    const t = dodecagonSquareTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'square').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('an interior triangle has all 3 edges paired (2 dodecagons + 1 square)', () => {
    const t = dodecagonSquareTiling(24)
    const max = Math.max(...t.nodes.filter((n) => n.shape === 'triangle').map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(3)
  })

  it('has a ragged border', () => {
    const t = dodecagonSquareTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = dodecagonSquareTiling(16)
    const b = dodecagonSquareTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
