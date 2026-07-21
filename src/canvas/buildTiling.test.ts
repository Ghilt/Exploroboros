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

  it('a square request of a scalar-count tiling is identical to the single-count call', () => {
    const two = buildTiling('kalleboda', 15, 15)
    const one = buildTiling('kalleboda', 15)
    expect(two.nodes.length).toBe(one.nodes.length)
    expect(two.bounds).toEqual(one.bounds)
  })

  // The bug fix: a lopsided grid used to average the two axes into one square patch (letterboxed in a
  // lopsided export). Now a scalar-count tiling is cropped to FILL the requested w:h frame.
  it('crops a scalar-count tiling to the requested aspect (fills a lopsided frame)', () => {
    const tall = buildTiling('kalleboda', 10, 40) // 1:4 tall
    const aspect = (tall.bounds.maxX - tall.bounds.minX) / (tall.bounds.maxY - tall.bounds.minY)
    expect(aspect).toBeGreaterThan(0.18)
    expect(aspect).toBeLessThan(0.32) // ≈ 10/40 = 0.25, allowing for ragged tile borders
    // It is NOT the old square-patch behaviour (which averaged to 25 → aspect ≈ 1).
    const averaged = buildTiling('kalleboda', 25) // old: round((10+40)/2)
    const avgAspect = (averaged.bounds.maxX - averaged.bounds.minX) / (averaged.bounds.maxY - averaged.bounds.minY)
    expect(Math.abs(avgAspect - 1)).toBeLessThan(0.1)
    expect(tall.nodes.length).toBeLessThan(averaged.nodes.length)
  })

  it('fills the frame for every non-square tiling (bounds aspect tracks the request)', () => {
    for (const id of ['triangular', 'hexagonal', 'kalleboda', 'trihexagonal', 'rhombille', 'penrose', 'hat']) {
      const wide = buildTiling(id, 40, 10) // 4:1 wide
      const aspect = (wide.bounds.maxX - wide.bounds.minX) / (wide.bounds.maxY - wide.bounds.minY)
      expect(aspect, `${id} should be wide`).toBeGreaterThan(2.2)
    }
  })
})
