import { describe, it, expect } from 'vitest'
import { snubSquareTiling, nodeById, neighborEdges, uniqueNeighbors, isBoundary } from '../index'

describe('snub square tiling (3.3.4.3.4)', () => {
  it('mixes squares and triangles', () => {
    const t = snubSquareTiling(20)
    expect(t.meta.id).toBe('snub-square')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('square')).toBe(true)
    expect(shapes.has('triangle')).toBe(true)
  })

  it('an interior square has all 4 edges paired, and every neighbour is a triangle', () => {
    const t = snubSquareTiling(24)
    const squares = t.nodes.filter((n) => n.shape === 'square')
    const fully = squares.filter((s) => neighborEdges(t, s.id).length === 4)
    expect(fully.length).toBeGreaterThan(0)
    // Distinguishes 3.3.4.3.4 from the elongated-triangular (3.3.3.4.4) tiling, where squares
    // border other squares: here a square only ever touches triangles.
    for (const s of fully) {
      for (const id of uniqueNeighbors(t, s.id)) {
        expect(nodeById(t, id)?.shape).toBe('triangle')
      }
    }
  })

  it('an interior triangle has all 3 edges paired (2 squares + 1 triangle)', () => {
    const t = snubSquareTiling(24)
    const tris = t.nodes.filter((n) => n.shape === 'triangle')
    const fully = tris.filter((tr) => neighborEdges(t, tr.id).length === 3)
    expect(fully.length).toBeGreaterThan(0)
    const sample = fully.find((tr) => {
      const shapes = uniqueNeighbors(t, tr.id).map((id) => nodeById(t, id)?.shape)
      return shapes.length === 3
    })
    expect(sample).toBeTruthy()
    const shapes = uniqueNeighbors(t, sample!.id).map((id) => nodeById(t, id)?.shape)
    expect(shapes.filter((s) => s === 'square').length).toBe(2)
    expect(shapes.filter((s) => s === 'triangle').length).toBe(1)
  })

  it('has roughly twice as many triangles as squares', () => {
    const t = snubSquareTiling(30)
    const sq = t.nodes.filter((n) => n.shape === 'square').length
    const tri = t.nodes.filter((n) => n.shape === 'triangle').length
    expect(tri / sq).toBeGreaterThan(1.5)
    expect(tri / sq).toBeLessThan(2.5)
  })

  it('has a ragged border', () => {
    const t = snubSquareTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = snubSquareTiling(16)
    const b = snubSquareTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
