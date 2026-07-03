import { describe, it, expect } from 'vitest'
import { parseProgram } from './parse'
import { serializeProgram } from './serialize'

function roundTrip(src: string): string {
  const r = parseProgram(src)
  if (!r.ok) throw new Error(r.error.message)
  return serializeProgram(r.value)
}

describe('traverser program serialization', () => {
  it('round-trips canonically (serialize ∘ parse is stable)', () => {
    const samples = [
      'move straight',
      'max-split = 2\nif visited@r1 == 1 then move l1\nincrease P',
      'move [r1, l1]',
      'move straight -> r2 -> e3',
      'put A = visited + 1',
      'increase Q by 2',
      'morph spinner straight',
      'movement = absolute\ndirective if visited@target > 0 always forbid move\nreset directives\nmove nearest-unvisited',
      'directive if visited@target == 0 always allow move',
      'if visited@target > 0 then move [r1, l1, straight]',
      'update heading 90',
      'if visited@e0@e0@e3 > 0 then move e1',
      'if [A@r1@e5] == 2 then move e1',
      'if tile-type@target == wedge then move straight',
    ]
    for (const s of samples) {
      const once = roundTrip(s)
      expect(roundTrip(once)).toBe(once)
    }
  })

  it('omits default settings and drops "by 1" on increase', () => {
    expect(roundTrip('max-split = 1\nincrease P by 1')).toBe('increase P')
  })

  it('keeps a named-predicate reference by name', () => {
    expect(roundTrip('if isCrowded then move l1')).toBe('if isCrowded then move l1')
  })

  it('serializes a directive predicate-first with the always/move tail', () => {
    expect(roundTrip('directive if visited@target > 0 always forbid move')).toBe(
      'directive if visited@target > 0 always forbid move',
    )
  })
})
