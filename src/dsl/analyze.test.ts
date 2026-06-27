import { describe, it, expect } from 'vitest'
import { parsePredicate } from './parse'
import { referencedShapes } from './analyze'

function shapes(src: string): string[] {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(`parse failed: ${r.error.message}`)
  return referencedShapes(r.value).sort()
}

describe('referencedShapes', () => {
  it('collects shape names from tile-type tests across the predicate', () => {
    expect(shapes('tile-type == wedge')).toEqual(['wedge'])
    expect(shapes('tile-type == triangle or (tile-type == square and visited > 0)')).toEqual(['square', 'triangle'])
    expect(shapes('not tile-type == hexagon')).toEqual(['hexagon'])
  })

  it('is empty when no tile-type test is present', () => {
    expect(shapes('visited > 0 and rotation == 90')).toEqual([])
  })
})
