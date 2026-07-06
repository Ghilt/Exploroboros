import { describe, it, expect } from 'vitest'
import { parsePredicate } from './parse'
import { serialize } from './serialize'
import { resolvePredRefs } from './resolveRefs'
import type { Pred } from './types'

function pred(src: string): Pred {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(`parse failed: ${r.error.message}`)
  return r.value
}

function resolved(src: string, names: ReadonlyMap<string, string>): string {
  const r = resolvePredRefs(pred(src), names)
  if (!r.ok) throw new Error(`resolve failed: ${r.error.message}`)
  return serialize(r.value)
}

function resolveErr(src: string, names: ReadonlyMap<string, string>): string {
  const r = resolvePredRefs(pred(src), names)
  if (r.ok) throw new Error('expected resolve to fail')
  return r.error.message
}

describe('resolvePredRefs', () => {
  it('leaves a ref-free predicate untouched', () => {
    expect(resolved('visited > 0 and [A] > 0', new Map())).toBe('visited > 0 and [A] > 0')
  })

  it('inlines a single named reference', () => {
    const names = new Map([['isCrowded', 'visited-neighbors > 2']])
    expect(resolved('isCrowded', names)).toBe('visited-neighbors > 2')
  })

  it('inlines a reference nested inside and/or/not', () => {
    const names = new Map([
      ['hasA', '[A] > 0'],
      ['hasC', '[C] > 0'],
    ])
    expect(resolved('hasA and hasC', names)).toBe('[A] > 0 and [C] > 0')
    expect(resolved('not hasA', names)).toBe('not [A] > 0')
  })

  it('resolves an underscore-joined name', () => {
    const names = new Map([['Has_A', '[A] > 0']])
    expect(resolved('Has_A and visited > 0', names)).toBe('[A] > 0 and visited > 0')
  })

  it('resolves transitively — a reference to a reference', () => {
    const names = new Map([
      ['outer', 'inner'],
      ['inner', 'visited > 0'],
    ])
    expect(resolved('outer', names)).toBe('visited > 0')
  })

  it('errors on an unknown name', () => {
    expect(resolveErr('ghost', new Map())).toMatch(/unknown predicate "ghost"/)
  })

  it('errors when a referenced predicate itself fails to parse', () => {
    const names = new Map([['broken', 'visited >']])
    expect(resolveErr('broken', names)).toMatch(/predicate "broken":/)
  })

  it('detects a direct self-reference', () => {
    const names = new Map([['loop', 'loop']])
    expect(resolveErr('loop', names)).toMatch(/refers to itself/)
  })

  it('detects an indirect cycle (foo -> bar -> foo)', () => {
    const names = new Map([
      ['foo', 'bar'],
      ['bar', 'foo'],
    ])
    expect(resolveErr('foo', names)).toMatch(/refers to itself/)
  })

  it('does not treat sibling references to the same name as a false cycle', () => {
    // hasA appears TWICE at the same level — not a cycle, just used twice.
    const names = new Map([['hasA', '[A] > 0']])
    expect(resolved('hasA and hasA', names)).toBe('[A] > 0 and [A] > 0')
  })
})
