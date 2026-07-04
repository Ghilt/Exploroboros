import { describe, it, expect } from 'vitest'
import { hatTiling, neighborEdges, isBoundary } from '../index'

describe('hat tiling (aperiodic einstein monotile)', () => {
  it('builds (stitches edge-to-edge) with hats and reflected hats', () => {
    const t = hatTiling(18)
    expect(t.meta.id).toBe('hat')
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('hat')).toBe(true)
    expect(shapes.has('hat-reflected')).toBe(true)
  })

  it('has well-connected interior tiles (adjacency graph built)', () => {
    const t = hatTiling(22)
    const max = Math.max(...t.nodes.map((n) => neighborEdges(t, n.id).length))
    expect(max).toBeGreaterThanOrEqual(10)
  })

  it('has roughly one reflected hat in seven (monotile signature)', () => {
    const t = hatTiling(30)
    const refl = t.nodes.filter((n) => n.shape === 'hat-reflected').length
    const ratio = refl / t.nodes.length
    expect(ratio).toBeGreaterThan(0.08)
    expect(ratio).toBeLessThan(0.2)
  })

  it('has a ragged border', () => {
    const t = hatTiling(16)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = hatTiling(18)
    const b = hatTiling(18)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
