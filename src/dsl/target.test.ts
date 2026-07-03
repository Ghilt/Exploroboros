import { describe, it, expect } from 'vitest'
import { parsePredicate, predReadsTarget } from './index'

function pred(src: string) {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('predReadsTarget', () => {
  it('is true when any leaf reads @target', () => {
    expect(predReadsTarget(pred('visited@target == 0'))).toBe(true)
    expect(predReadsTarget(pred('visited == 0 and visited-neighbors@target == 1'))).toBe(true)
    expect(predReadsTarget(pred('tile-type@target == wedge'))).toBe(true)
    expect(predReadsTarget(pred('[A@target] > 0'))).toBe(true)
    expect(predReadsTarget(pred('not (visited@target == 0)'))).toBe(true)
  })

  it('is false for current-tile and fixed-edge paths', () => {
    expect(predReadsTarget(pred('visited == 0'))).toBe(false)
    expect(predReadsTarget(pred('visited@e1 == 0'))).toBe(false)
    expect(predReadsTarget(pred('visited@r1@e5 == 1 and tile-type@e0 == wedge'))).toBe(false)
  })
})
