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

  it('builds the triangular and hexagonal tilings', () => {
    const tri = buildTiling('triangular', 16)
    expect(tri.meta.id).toBe('triangular')
    expect(tri.nodes.every((n) => n.shape === 'triangle')).toBe(true)
    const hex = buildTiling('hexagonal', 16)
    expect(hex.meta.id).toBe('hexagonal')
    expect(hex.nodes.every((n) => n.shape === 'hexagon')).toBe(true)
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

  it('builds a genuinely rectangular grid for the square tiling', () => {
    const t = buildTiling('square', 5, 3)
    expect(t.nodes.length).toBe(15) // 5 wide x 3 tall, not 5x5 or 3x3
  })

  it('averages the two axes for tilings that only take one scalar count', () => {
    const uneven = buildTiling('kalleboda', 10, 20)
    const averaged = buildTiling('kalleboda', 15) // (10+20)/2 = 15
    expect(uneven.nodes.length).toBe(averaged.nodes.length)
  })
})
