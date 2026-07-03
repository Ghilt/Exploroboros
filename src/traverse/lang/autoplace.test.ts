import { describe, it, expect } from 'vitest'
import { parseProgram } from './parse'
import { serializeProgram } from './serialize'
import { compileProgram } from './compile'

function ok(src: string) {
  const r = parseProgram(src)
  if (!r.ok) throw new Error(`expected parse ok, got: ${r.error.message}`)
  return r.value
}

describe('auto-place parsing', () => {
  it('parses a line with a guard into placements (not statements)', () => {
    const p = ok('auto-place line {0, 0, 0} if tile-type == octagon\nmove nearest-unvisited')
    expect(p.statements).toHaveLength(1) // the move — unaffected
    expect(p.placements).toHaveLength(1)
    const r = p.placements[0]
    expect(r.shape).toBe('line')
    expect(r.spec).toEqual({ angle: 0, percent: 0, edge: 0 })
    expect(r.guard?.pred.kind).toBe('inline')
  })

  it('parses a line with no guard', () => {
    const p = ok('auto-place line {90, 100, 3}')
    expect(p.placements[0]).toEqual({ shape: 'line', spec: { angle: 90, percent: 100, edge: 3 }, guard: undefined })
  })

  it('parses negative numbers in the spec', () => {
    const p = ok('auto-place line {-45, 50, 2}')
    expect(p.placements[0].spec).toEqual({ angle: -45, percent: 50, edge: 2 })
  })

  it('parses a named-predicate guard, resolved by compile', () => {
    const p = ok('auto-place line {0, 0, 0} if isOct')
    expect(p.placements[0].guard).toEqual({ pred: { kind: 'named', name: 'isOct' } })
    const c = compileProgram('auto-place line {0, 0, 0} if isOct', new Map([['isOct', 'tile-type == octagon']]))
    if (!c.ok) throw new Error(c.error.message)
    expect(c.value.placements[0].guard?.pred.kind).toBe('inline')
  })

  it('round-trips through serialize (with and without a guard)', () => {
    for (const src of [
      'auto-place line {0, 0, 0} if tile-type == octagon',
      'auto-place line {-45, 50, 2}',
      'max-split = 3\nauto-place line {0, 0, 1} if visited == 0\nmove straight',
    ]) {
      const once = serializeProgram(ok(src))
      const twice = serializeProgram(ok(once))
      expect(twice).toBe(once)
    }
  })

  it('reports errors for a malformed spec or unknown shape', () => {
    expect(parseProgram('auto-place line {0, 0}').ok).toBe(false) // too few slots
    expect(parseProgram('auto-place circle {0, 0, 0}').ok).toBe(false) // unknown shape
    expect(parseProgram('auto-place line 0, 0, 0').ok).toBe(false) // missing braces
  })
})
