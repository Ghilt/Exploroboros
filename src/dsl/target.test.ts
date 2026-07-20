import { describe, it, expect } from 'vitest'
import { parsePredicate, predReadsTarget, predIsAbsolute, predFoundIndices } from './index'

function pred(src: string) {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('predReadsTarget', () => {
  it('is true when any leaf reads .target', () => {
    expect(predReadsTarget(pred('visited.target == 0'))).toBe(true)
    expect(predReadsTarget(pred('visited == 0 and visited-neighbors.target == 1'))).toBe(true)
    expect(predReadsTarget(pred('tile-type.target == wedge'))).toBe(true)
    expect(predReadsTarget(pred('[A.target] > 0'))).toBe(true)
    expect(predReadsTarget(pred('not (visited.target == 0)'))).toBe(true)
  })

  it('is false for current-tile and fixed-edge paths', () => {
    expect(predReadsTarget(pred('visited == 0'))).toBe(false)
    expect(predReadsTarget(pred('visited.e1 == 0'))).toBe(false)
    expect(predReadsTarget(pred('visited.r1.e5 == 1 and tile-type.e0 == wedge'))).toBe(false)
  })

  it('is false for a named-predicate reference (resolved before this ever sees it)', () => {
    expect(predReadsTarget(pred('isCrowded'))).toBe(false)
    expect(predReadsTarget(pred('isCrowded and visited.target == 0'))).toBe(true)
  })

  it('is true when either operand of a tile comparison is .target', () => {
    expect(predReadsTarget(pred('target != straight'))).toBe(true)
    expect(predReadsTarget(pred('straight == target'))).toBe(true)
    expect(predReadsTarget(pred('e0 == e3'))).toBe(false)
    expect(predReadsTarget(pred('straight != back'))).toBe(false)
  })
})

describe('predIsAbsolute / predFoundIndices — tile comparison', () => {
  it('a tile comparison is absolute only when BOTH terms are absolute (edge / tile N)', () => {
    expect(predIsAbsolute(pred('e0 == e3'))).toBe(true)
    expect(predIsAbsolute(pred('tile 3 == e0'))).toBe(true)
    expect(predIsAbsolute(pred('target != straight'))).toBe(false)
    expect(predIsAbsolute(pred('straight == e0'))).toBe(false)
  })

  it('collects .fN indices from both operands', () => {
    expect(predFoundIndices(pred('f0 == f1')).sort()).toEqual([0, 1])
    expect(predFoundIndices(pred('f2 == target'))).toEqual([2])
  })
})

describe('computed amounts inside a `.`-path are seen by the analysis', () => {
  it('an edge amount reading walker state makes the path NON-absolute (find-lowest rejects it)', () => {
    expect(predIsAbsolute(pred('visited.e(orientation) == 0'))).toBe(true) // orientation is a tile attr
    expect(predIsAbsolute(pred('visited.e(steps) == 0'))).toBe(false) // steps is walker state
    expect(predIsAbsolute(pred('visited.t(orientation) == 0'))).toBe(true)
  })

  it('an amount reading `.target` makes the guard read the destination', () => {
    expect(predReadsTarget(pred('visited.e(visited.target) == 0'))).toBe(true)
    expect(predReadsTarget(pred('visited.e(orientation) == 0'))).toBe(false)
  })

  it('a literal `.fN` nested inside a computed amount is still collected', () => {
    expect(predFoundIndices(pred('visited.e(visited.f0) == 0'))).toEqual([0])
  })
})
