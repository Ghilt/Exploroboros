import { describe, it, expect } from 'vitest'
import { oppositeSides, makeShapeDef, interiorAngleDeg, SQUARE } from './shapes'

describe('oppositeSides', () => {
  it('returns a single opposite for even-sided polygons', () => {
    expect(oppositeSides(0, 4)).toEqual([2])
    expect(oppositeSides(1, 4)).toEqual([3])
    expect(oppositeSides(2, 4)).toEqual([0])
    expect(oppositeSides(3, 4)).toEqual([1])
    expect(oppositeSides(0, 6)).toEqual([3])
    expect(oppositeSides(2, 6)).toEqual([5])
  })

  it('returns the two flanking sides for odd-sided polygons', () => {
    expect(oppositeSides(0, 3)).toEqual([1, 2])
    expect(oppositeSides(1, 3)).toEqual([2, 0])
    expect(oppositeSides(2, 3)).toEqual([0, 1])
  })

  it('has length 1 for even N and 2 for odd N across the polygon', () => {
    for (let n = 3; n <= 12; n += 1) {
      for (let k = 0; k < n; k += 1) {
        expect(oppositeSides(k, n).length).toBe(n % 2 === 0 ? 1 : 2)
      }
    }
  })
})

describe('makeShapeDef', () => {
  it('builds the square with N<->S, E<->W opposites', () => {
    expect(SQUARE.sides).toBe(4)
    expect(SQUARE.interiorAngleDeg).toBe(90)
    expect(SQUARE.oppositeSides).toEqual([[2], [3], [0], [1]])
  })

  it('computes interior angles', () => {
    expect(interiorAngleDeg(3)).toBeCloseTo(60)
    expect(makeShapeDef('triangle', 3).interiorAngleDeg).toBeCloseTo(60)
    expect(makeShapeDef('hexagon', 6).interiorAngleDeg).toBeCloseTo(120)
    expect(makeShapeDef('octagon', 8).interiorAngleDeg).toBeCloseTo(135)
  })
})
