import { describe, it, expect } from 'vitest'
import { squareTiling, hexagonalTiling, uniqueNeighbors } from './index'
import { numberingOrder, numberOf, numberingFor } from './numbering'
import type { Tiling } from './types'

const sq = squareTiling(5, 5)

const centre = (t: Tiling) => {
  const { minX, minY, maxX, maxY } = t.bounds
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return { cx, cy, eps: 0.5 * Math.sqrt(((maxX - minX) * (maxY - minY)) / t.nodes.length) }
}
const node = (t: Tiling, id: string) => t.nodes.find((n) => n.id === id)!
const d2From = (t: Tiling, id: string) => {
  const { cx, cy } = centre(t)
  const c = node(t, id).centroid
  return (c.x - cx) ** 2 + (c.y - cy) ** 2
}
const nearestCentre = (t: Tiling) => [...t.nodes].map((n) => n.id).sort((a, b) => d2From(t, a) - d2From(t, b))[0]

const isPermutation = (order: ReadonlyArray<string>, t: Tiling) => {
  expect(order).toHaveLength(t.nodes.length)
  expect(new Set(order)).toEqual(new Set(t.nodes.map((n) => n.id)))
}

describe('numbering — left-to-right (reading order)', () => {
  it('is a permutation and numberOf round-trips; unknown id -> -1', () => {
    const order = numberingOrder(sq, 'left-to-right')
    isPermutation(order, sq)
    for (let i = 0; i < order.length; i += 1) expect(numberOf(sq, 'left-to-right', order[i])).toBe(i)
    expect(numberOf(sq, 'left-to-right', 'nope')).toBe(-1)
  })

  it('reads the top row first, left → right (square)', () => {
    const { eps } = centre(sq)
    const topY = Math.max(...sq.nodes.map((n) => n.centroid.y))
    const topRow = sq.nodes.filter((n) => topY - n.centroid.y <= eps).sort((a, b) => a.centroid.x - b.centroid.x)
    const order = numberingOrder(sq, 'left-to-right')
    expect(order.slice(0, topRow.length)).toEqual(topRow.map((n) => n.id))
  })

  it('goes top→bottom, each row left→right, on a HEXAGONAL grid too (not column-first)', () => {
    const hex = hexagonalTiling(12)
    const { eps } = centre(hex)
    const order = numberingOrder(hex, 'left-to-right')
    isPermutation(order, hex)
    for (let i = 1; i < order.length; i += 1) {
      const prev = node(hex, order[i - 1]).centroid
      const cur = node(hex, order[i]).centroid
      // Never jump back UP a row (reading top→bottom)...
      expect(cur.y).toBeLessThanOrEqual(prev.y + eps)
      // ...and within a row (near-equal y) x strictly increases (left→right).
      if (Math.abs(cur.y - prev.y) <= eps) expect(cur.x).toBeGreaterThan(prev.x - 1e-9)
    }
  })
})

describe('numbering — radial (concentric rings)', () => {
  it('starts at the centre and never decreases in distance', () => {
    const order = numberingOrder(sq, 'radial')
    isPermutation(order, sq)
    expect(order[0]).toBe(nearestCentre(sq))
    for (let i = 1; i < order.length; i += 1) expect(d2From(sq, order[i])).toBeGreaterThanOrEqual(d2From(sq, order[i - 1]) - 1e-9)
  })
})

describe('numbering — spiral (one flowing walk out from the centre)', () => {
  it('starts at the centre and ends on the boundary (it winds all the way out)', () => {
    const order = numberingOrder(sq, 'spiral')
    isPermutation(order, sq)
    expect(order[0]).toBe(nearestCentre(sq))
    // The LAST tile of the walk is a boundary tile — on a square grid that means < 4 edge-neighbours
    // (interior tiles have 4). A spiral ends out at the rim, not back in the middle.
    expect(uniqueNeighbors(sq, order[order.length - 1]).length).toBeLessThan(4)
  })

  it('is ONE connected walk — consecutive numbers are edge-adjacent (the +1 +1 path)', () => {
    // The owner's definition: a spiral is a single path that steps to an adjacent tile each +1, winding
    // out from the centre. On the convex square grid the greedy sharpest-right walk never dead-ends, so
    // EVERY consecutive pair shares an edge. This is the faithful "it's really a path" guarantee — the old
    // ring-sort stranded tiles (a tile numbered a whole winding away from its neighbours); a walk cannot.
    const order = numberingOrder(sq, 'spiral')
    for (let i = 1; i < order.length; i += 1) {
      expect(uniqueNeighbors(sq, order[i - 1])).toContain(order[i])
    }
  })

  it('is a DIFFERENT order from radial (a walk, not sorted concentric rings)', () => {
    expect(numberingOrder(sq, 'spiral')).not.toEqual(numberingOrder(sq, 'radial'))
  })

  it('works, starts at the centre, + is deterministic (memoized) on a non-square tiling', () => {
    const hex = hexagonalTiling(12)
    const order = numberingOrder(hex, 'spiral')
    isPermutation(order, hex)
    expect(order[0]).toBe(nearestCentre(hex))
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
