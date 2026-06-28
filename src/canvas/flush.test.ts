import { describe, it, expect } from 'vitest'
import type { Vec2 } from '../tiling'
import { flattenColor, inflatePolygon } from './flush'

describe('flattenColor', () => {
  it('returns the base when there is no overlay colour', () => {
    expect(flattenColor(undefined, '#ffffff')).toBe('rgb(255, 255, 255)')
    expect(flattenColor(undefined, '#000')).toBe('rgb(0, 0, 0)')
  })

  it('passes an opaque colour through (alpha 1)', () => {
    expect(flattenColor('#ff0000', '#ffffff')).toBe('rgb(255, 0, 0)')
    expect(flattenColor('rgba(1, 2, 3, 1)', '#fff')).toBe('rgb(1, 2, 3)')
  })

  it('composites a translucent colour over the opaque base (no alpha left)', () => {
    // 50% black over white → mid grey, fully opaque.
    expect(flattenColor('rgba(0,0,0,0.5)', '#ffffff')).toBe('rgb(128, 128, 128)')
    // 25% red over white
    expect(flattenColor('rgba(255,0,0,0.25)', '#ffffff')).toBe('rgb(255, 191, 191)')
  })

  it('is robust to junk input (never throws; returns a valid rgb())', () => {
    expect(() => flattenColor('not-a-colour', '#fff')).not.toThrow()
    expect(flattenColor('not-a-colour', '#fff')).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })
})

describe('inflatePolygon', () => {
  const square: Vec2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]
  const centroid: Vec2 = { x: 0.5, y: 0.5 }

  it('grows the polygon outward from the centroid', () => {
    const out = inflatePolygon(square, centroid, 0.1)
    // every corner moved away from the centre
    expect(out[0].x).toBeLessThan(0)
    expect(out[0].y).toBeLessThan(0)
    expect(out[2].x).toBeGreaterThan(1)
    expect(out[2].y).toBeGreaterThan(1)
    // centre is preserved (symmetric growth)
    const cx = out.reduce((s, v) => s + v.x, 0) / out.length
    const cy = out.reduce((s, v) => s + v.y, 0) / out.length
    expect(cx).toBeCloseTo(0.5)
    expect(cy).toBeCloseTo(0.5)
  })

  it('is a no-op (copy) for zero / negative delta', () => {
    expect(inflatePolygon(square, centroid, 0)).toEqual(square)
    expect(inflatePolygon(square, centroid, -1)).toEqual(square)
  })

  it('leaves a vertex sitting on the centroid alone (no direction to push)', () => {
    const verts: Vec2[] = [{ x: 0.5, y: 0.5 }, { x: 2, y: 0.5 }, { x: 0.5, y: 2 }]
    const out = inflatePolygon(verts, centroid, 0.5)
    expect(out[0]).toEqual({ x: 0.5, y: 0.5 })
  })
})
