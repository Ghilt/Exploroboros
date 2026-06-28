import { describe, it, expect } from 'vitest'
import {
  kallebodaTiling,
  triangularTiling,
  squareTiling,
  snubSquareTiling,
  tileOrientation,
  orientationMap,
  tileRotationDeg,
  type Tiling,
} from './index'

// Orientation values present for a given shape, sorted.
function orientationsOf(tiling: Tiling, shape: string): number[] {
  const set = new Set<number>()
  for (const n of tiling.nodes) if (n.shape === shape) set.add(tileOrientation(tiling, n.id))
  return [...set].sort((a, b) => a - b)
}

describe('tileOrientation', () => {
  it('is a contiguous 0..k-1 range per shape (no gaps)', () => {
    for (const t of [squareTiling(6, 6), triangularTiling(8), kallebodaTiling(14), snubSquareTiling(8)]) {
      const byShape = new Map<string, Set<number>>()
      for (const n of t.nodes) {
        if (!byShape.has(n.shape)) byShape.set(n.shape, new Set())
        byShape.get(n.shape)!.add(tileOrientation(t, n.id))
      }
      for (const [shape, set] of byShape) {
        const sorted = [...set].sort((a, b) => a - b)
        expect(sorted, `${shape} orientations contiguous`).toEqual(sorted.map((_, i) => i))
      }
    }
  })

  it('single-rotation shapes are all 0; kalleboda wedges span 0..3, octagons 0', () => {
    expect(orientationsOf(squareTiling(6, 6), 'square')).toEqual([0])
    const k = kallebodaTiling(16)
    expect(orientationsOf(k, 'octagon')).toEqual([0])
    expect(orientationsOf(k, 'wedge')).toEqual([0, 1, 2, 3])
  })

  it('triangular has two orientations (up/down)', () => {
    expect(orientationsOf(triangularTiling(8), 'triangle')).toEqual([0, 1])
  })

  it('snub-square distinguishes the two square rotations', () => {
    expect(orientationsOf(snubSquareTiling(8), 'square')).toEqual([0, 1])
  })

  it('memoizes per Tiling (same reference) and is deterministic across rebuilds', () => {
    const t = kallebodaTiling(12)
    expect(orientationMap(t)).toBe(orientationMap(t))
    const a = kallebodaTiling(12)
    const b = kallebodaTiling(12)
    for (const n of a.nodes) expect(tileOrientation(b, n.id)).toBe(tileOrientation(a, n.id))
  })

  // PROBE (kept as an assertion + log): pair each wedge orientation with its slot (lattice[2]) and
  // rotation, so the classic port knows which orientation index turns which way. The kalleboda
  // generator fixes slot->prototype-rot: 6->90, 7->0, 8->270, 9->180; classic turns rot {0,180}->r1,
  // {90,270}->l1. So the r1 orientations are the ones whose slot is 7 or 9, l1 the ones with slot 6/8.
  it('maps each wedge orientation to a single slot (probe for classic routing)', () => {
    const t = kallebodaTiling(16)
    const byOrient = new Map<number, { slots: Set<number>; rot: number }>()
    for (const n of t.nodes) {
      if (n.shape !== 'wedge') continue
      const o = tileOrientation(t, n.id)
      if (!byOrient.has(o)) byOrient.set(o, { slots: new Set(), rot: tileRotationDeg(n.vertices, n.centroid) })
      byOrient.get(o)!.slots.add(n.lattice[2])
    }
    for (const [o, info] of byOrient) {
      expect([...info.slots].length, `orientation ${o} maps to exactly one slot`).toBe(1)
    }
    expect(byOrient.size).toBe(4)
  })
})
