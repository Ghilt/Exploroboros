import { describe, it, expect } from 'vitest'
import type { Bounds } from '../tiling'
import { pickCanvasSize, DESKTOP_CAPS } from './sizing'

const SQUARE: Bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
const WIDE: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 10 }
const TALL: Bounds = { minX: 0, minY: 0, maxX: 10, maxY: 40 }

describe('pickCanvasSize', () => {
  it('sizes a square tiling to a square canvas at the requested long edge', () => {
    const s = pickCanvasSize(SQUARE, 1000, DESKTOP_CAPS)
    expect(s.width).toBe(1000)
    expect(s.height).toBe(1000)
    expect(s.clamped).toBe(false)
    expect(s.view.scale).toBeGreaterThan(0)
  })

  it('matches the tiling aspect ratio (long edge = requested), no distortion', () => {
    const wide = pickCanvasSize(WIDE, 1000, DESKTOP_CAPS)
    expect(wide.width).toBe(1000)
    expect(wide.height).toBe(500)
    const tall = pickCanvasSize(TALL, 1000, DESKTOP_CAPS)
    expect(tall.height).toBe(1000)
    expect(tall.width).toBe(250)
  })

  it('clamps to the per-edge cap and flags it', () => {
    const s = pickCanvasSize(SQUARE, 20000, { maxEdge: 4096, maxArea: 1e12 })
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(4096)
    expect(s.clamped).toBe(true)
  })

  it('clamps to the total-area cap', () => {
    const s = pickCanvasSize(SQUARE, 5000, { maxEdge: 100000, maxArea: 1_000_000 })
    expect(s.width * s.height).toBeLessThanOrEqual(1_000_000)
    expect(s.clamped).toBe(true)
  })
})
