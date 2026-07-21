import { describe, it, expect } from 'vitest'
import { inscribedRadius } from './letters'
import type { TileNode } from '../tiling'

// A minimal TileNode stand-in — inscribedRadius reads only vertices + centroid.
function tile(vertices: ReadonlyArray<{ x: number; y: number }>, centroid: { x: number; y: number }): TileNode {
  return { vertices, centroid } as unknown as TileNode
}

describe('inscribedRadius', () => {
  it('is half the side for a unit square', () => {
    const n = tile([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], { x: 0.5, y: 0.5 })
    expect(inscribedRadius(n)).toBeCloseTo(0.5, 6)
  })

  it('scales with tile size', () => {
    const small = tile([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], { x: 0.5, y: 0.5 })
    const big = tile([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], { x: 2, y: 2 })
    expect(inscribedRadius(big)).toBeGreaterThan(inscribedRadius(small))
  })

  it('is small for a thin sliver (narrowest dimension wins)', () => {
    const sliver = tile([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.2 }, { x: 0, y: 0.2 }], { x: 2, y: 0.1 })
    expect(inscribedRadius(sliver)).toBeCloseTo(0.1, 6)
  })
})
