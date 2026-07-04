import { describe, it, expect } from 'vitest'
import { penroseTiling, neighborEdges, isBoundary } from '../index'

describe('penrose tiling (P3 rhombi)', () => {
  it('is built from thin and thick rhombi', () => {
    const t = penroseTiling(24)
    expect(t.meta.id).toBe('penrose')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes).toEqual(new Set(['thin-rhombus', 'thick-rhombus']))
  })

  it('is edge-to-edge — an interior rhombus has all 4 edges paired', () => {
    const t = penroseTiling(28)
    const max = Math.max(...t.nodes.map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('has thick:thin ratio approaching the golden ratio (aperiodicity signature)', () => {
    const t = penroseTiling(44)
    const thick = t.nodes.filter((n) => n.shape === 'thick-rhombus').length
    const thin = t.nodes.filter((n) => n.shape === 'thin-rhombus').length
    expect(thick / thin).toBeGreaterThan(1.4)
    expect(thick / thin).toBeLessThan(1.9)
  })

  it('has a ragged border', () => {
    const t = penroseTiling(16)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = penroseTiling(20)
    const b = penroseTiling(20)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
