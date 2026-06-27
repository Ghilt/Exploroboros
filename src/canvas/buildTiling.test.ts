import { describe, it, expect } from 'vitest'
import { buildTiling } from './buildTiling'

describe('buildTiling', () => {
  it('builds an N*N square grid', () => {
    const t = buildTiling('square', 20)
    expect(t.meta.id).toBe('square')
    expect(t.nodes.length).toBe(400)
  })

  it('builds the kalleboda octagon+wedge tiling', () => {
    const t = buildTiling('kalleboda', 20)
    expect(t.meta.id).toBe('kalleboda')
    expect(t.nodes.length).toBeGreaterThan(50)
    expect(t.nodes.some((n) => n.shape === 'wedge')).toBe(true)
  })

  it('falls back to the square for an unknown id', () => {
    const t = buildTiling('not-a-tiling', 5)
    expect(t.meta.id).toBe('square')
    expect(t.nodes.length).toBe(25)
  })

  it('clamps the count to a positive integer', () => {
    expect(buildTiling('square', 0).nodes.length).toBe(1)
    expect(buildTiling('square', 3.7).nodes.length).toBe(9)
  })
})
