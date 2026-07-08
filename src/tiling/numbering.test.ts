import { describe, it, expect } from 'vitest'
import { squareTiling, hexagonalTiling } from './index'
import { numberingOrder, numberOf, numberingFor } from './numbering'

const sq = squareTiling(5, 5)

describe('numbering — normal', () => {
  it('is exactly generation order', () => {
    expect(numberingOrder(sq, 'normal')).toEqual(sq.nodes.map((n) => n.id))
  })

  it('numberOf is the position; unknown id -> -1', () => {
    expect(numberOf(sq, 'normal', sq.nodes[0].id)).toBe(0)
    expect(numberOf(sq, 'normal', sq.nodes[7].id)).toBe(7)
    expect(numberOf(sq, 'normal', 'nope')).toBe(-1)
  })
})

describe('numbering — spiral', () => {
  it('is a permutation of every tile (no tile lost or duplicated)', () => {
    const order = numberingOrder(sq, 'spiral')
    expect(order).toHaveLength(sq.nodes.length)
    expect(new Set(order)).toEqual(new Set(sq.nodes.map((n) => n.id)))
  })

  it('numbers outward from the centre — tile 0 is the one nearest the bounds centre', () => {
    const { minX, minY, maxX, maxY } = sq.bounds
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const nearest = [...sq.nodes].sort((a, b) => {
      const da = (a.centroid.x - cx) ** 2 + (a.centroid.y - cy) ** 2
      const db = (b.centroid.x - cx) ** 2 + (b.centroid.y - cy) ** 2
      return da - db
    })[0]
    expect(numberingOrder(sq, 'spiral')[0]).toBe(nearest.id)
    // Distance from the centre is non-decreasing along the order (concentric rings out).
    const d2 = (id: string) => {
      const n = sq.nodes.find((x) => x.id === id)!
      return (n.centroid.x - cx) ** 2 + (n.centroid.y - cy) ** 2
    }
    const order = numberingOrder(sq, 'spiral')
    for (let i = 1; i < order.length; i += 1) expect(d2(order[i])).toBeGreaterThanOrEqual(d2(order[i - 1]) - 1e-9)
  })

  it('numberOf round-trips against the order', () => {
    const order = numberingOrder(sq, 'spiral')
    for (let i = 0; i < order.length; i += 1) expect(numberOf(sq, 'spiral', order[i])).toBe(i)
  })

  it('works on a non-square tiling too (deterministic permutation)', () => {
    const hex = hexagonalTiling(12)
    const order = numberingOrder(hex, 'spiral')
    expect(new Set(order)).toEqual(new Set(hex.nodes.map((n) => n.id)))
    // Deterministic: same tiling instance memoized to the identical array.
    expect(numberingOrder(hex, 'spiral')).toBe(order)
  })
})

describe('numberingFor', () => {
  it('bundles the order + an O(1) position lookup that agrees with numberOf', () => {
    const b = numberingFor(sq, 'spiral')
    expect(b.order).toEqual(numberingOrder(sq, 'spiral'))
    expect(b.posOf(b.order[3])).toBe(3)
    expect(b.posOf('nope')).toBe(-1)
  })
})
