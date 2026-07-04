import { describe, it, expect } from 'vitest'
import { rhombilleTiling, neighborEdges, isBoundary, orientationMap } from '../index'

describe('rhombille tiling', () => {
  it('is built entirely from rhombi', () => {
    const t = rhombilleTiling(20)
    expect(t.meta.id).toBe('rhombille')
    expect(new Set(t.nodes.map((n) => n.shape))).toEqual(new Set(['rhombus']))
  })

  it('an interior rhombus has all 4 edges paired', () => {
    const t = rhombilleTiling(24)
    const max = Math.max(...t.nodes.map((n) => neighborEdges(t, n.id).length))
    expect(max).toBe(4)
  })

  it('has exactly three rhombus orientations', () => {
    const t = rhombilleTiling(24)
    const orient = orientationMap(t)
    expect(new Set(t.nodes.map((n) => orient.get(n.id))).size).toBe(3)
  })

  it('has a ragged border', () => {
    const t = rhombilleTiling(14)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = rhombilleTiling(16)
    const b = rhombilleTiling(16)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })
})
