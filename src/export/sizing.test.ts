import { describe, it, expect } from 'vitest'
import type { Bounds } from '../tiling'
import { pickCanvasSize, DESKTOP_CAPS } from './sizing'

const SQUARE: Bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
const WIDE: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 10 }

describe('pickCanvasSize', () => {
  it('honours the requested width × height', () => {
    const s = pickCanvasSize(SQUARE, 1000, 1000, DESKTOP_CAPS)
    expect(s.width).toBe(1000)
    expect(s.height).toBe(1000)
    expect(s.clamped).toBe(false)
    expect(s.view.scale).toBeGreaterThan(0)
  })

  it('allows a non-square canvas (the tiling is fit/centred into it, no distortion)', () => {
    const s = pickCanvasSize(SQUARE, 1200, 600, DESKTOP_CAPS)
    expect(s.width).toBe(1200)
    expect(s.height).toBe(600)
    expect(s.view.scale).toBeGreaterThan(0) // the square tiling is contained within the wide canvas
  })

  it('clamps to the per-edge cap, preserving the requested aspect', () => {
    const s = pickCanvasSize(WIDE, 20000, 10000, { maxEdge: 4096, maxArea: 1e12 })
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(4096)
    expect(s.width / s.height).toBeCloseTo(2, 1) // the 2:1 request is kept
    expect(s.clamped).toBe(true)
  })

  it('clamps to the total-area cap', () => {
    const s = pickCanvasSize(SQUARE, 5000, 5000, { maxEdge: 100000, maxArea: 1_000_000 })
    expect(s.width * s.height).toBeLessThanOrEqual(1_000_000)
    expect(s.clamped).toBe(true)
  })
})
