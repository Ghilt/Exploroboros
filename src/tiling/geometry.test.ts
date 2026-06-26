import { describe, it, expect } from 'vitest'
import { regularPolygonVertices, centroid, edgeMidpoint, normalAngle, quantizeKey } from './geometry'

describe('regularPolygonVertices', () => {
  it('produces n vertices centered on the requested point', () => {
    const verts = regularPolygonVertices({ x: 2, y: 3 }, 1, 6)
    expect(verts.length).toBe(6)
    const c = centroid(verts)
    expect(c.x).toBeCloseTo(2)
    expect(c.y).toBeCloseTo(3)
  })
})

describe('normalAngle', () => {
  // Compare the direction vector, not raw radians, so the +pi/-pi branch for west doesn't matter.
  const dir = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const t = normalAngle(a, b)
    return { x: Math.cos(t), y: Math.sin(t) }
  }

  // Outward normals of a CCW unit square: bottom=S(0,-1), right=E(1,0), top=N(0,1), left=W(-1,0).
  it('points outward for each side of a CCW unit square', () => {
    expect(dir({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual({ x: expect.closeTo(0), y: expect.closeTo(-1) })
    expect(dir({ x: 1, y: 0 }, { x: 1, y: 1 })).toEqual({ x: expect.closeTo(1), y: expect.closeTo(0) })
    expect(dir({ x: 1, y: 1 }, { x: 0, y: 1 })).toEqual({ x: expect.closeTo(0), y: expect.closeTo(1) })
    expect(dir({ x: 0, y: 1 }, { x: 0, y: 0 })).toEqual({ x: expect.closeTo(-1), y: expect.closeTo(0) })
  })
})

describe('edgeMidpoint', () => {
  it('is the average of the endpoints', () => {
    expect(edgeMidpoint({ x: 0, y: 0 }, { x: 2, y: 4 })).toEqual({ x: 1, y: 2 })
  })
})

describe('quantizeKey', () => {
  it('is independent of endpoint order', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 1, y: 0 }
    expect(quantizeKey(a, b, 1e-6)).toBe(quantizeKey(b, a, 1e-6))
  })
})
