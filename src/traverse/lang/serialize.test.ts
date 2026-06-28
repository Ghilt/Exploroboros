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
      'max-split = 2\nif visited == 1 @ r1 then move l1\nincrease P',
      'move [r1, l1]',
      'move straight -> r2 -> edge 3',
      'put A = visited + 1',
      'increase Q by 2',
      'morph spinner straight',
      'movement = absolute\ndirective move always forbid if visited > 0\nreset directives\nmove nearest-unvisited',
      'update heading 90',
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
})
