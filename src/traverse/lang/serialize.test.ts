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
      'move straight@r2@e3',
      'put [A] = visited + 1',
      'put [B@e1] = 1',
      'if [C] == 0 then put [B@e1] = 1',
      'increase [C@r1@e5] by 2',
      'increase Q by 2',
      'morph spinner straight',
      'movement = absolute\ndirective if visited@target > 0 always forbid move\nreset directives\nmove nearest-unvisited',
      'directive if visited@target == 0 always allow move',
      'if visited@target > 0 then move [r1, l1, straight]',
      'update heading 90',
      'if visited@e0@e0@e3 > 0 then move e1',
      'if [A@r1@e5] == 2 then move e1',
      'if tile-type@target == wedge then move straight',
      // new: @-chains, bare registries, if-blocks, find-tile + fN
      'move e0@e4',
      'put A = A + 1',
      'increase A by 2',
      'if visited > 0 {\n  put A = 1\n  move straight\n}',
      'find-tile A == 5 {\n  move nearest-unvisited\n}\nmove f0',
      'if visited == 2 then move find-tile A == 5 {\n  move straight\n}',
      'find-tile A == 5 { move straight }\nmove [f0@e0, f0@straight]',
      'find-tile A == 5 { move straight }\nif exists@f0 then move f0',
      'if exists@e0 then move e0',
    ]
    for (const s of samples) {
      const once = roundTrip(s)
      expect(roundTrip(once)).toBe(once)
    }
  })

  it('serializes an if-block across indented lines', () => {
    expect(roundTrip('if visited > 0 { put A = 1\nmove straight }')).toBe('if visited > 0 {\n  put A = 1\n  move straight\n}')
  })

  it('serializes bare registry writes and @-chains canonically', () => {
    expect(roundTrip('put [A] = 1')).toBe('put A = 1') // a bracketed single registry canonicalises to bare
    expect(roundTrip('move e0@e4')).toBe('move e0@e4')
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
