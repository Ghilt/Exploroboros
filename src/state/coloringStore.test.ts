import { describe, it, expect } from 'vitest'
import { makeRule, withAddedRule, withAddedRules, withDuplicatedRule, withRemovedRule, withReordered, withReplacedRule } from './coloringStore'
import type { ColoringRule } from '../colorizer'

const rule = (id: string): ColoringRule => ({
  id,
  predicate: { kind: 'inline', text: 'visited > 0' },
  color: { kind: 'flat', hex: '#ffffff' },
  opacity: 1,
})

describe('coloringStore — pure updaters', () => {
  it('makeRule produces a flat rule referencing a bundled predicate at full opacity', () => {
    const r = makeRule()
    expect(r.predicate).toEqual({ kind: 'ref', id: 'visited' })
    expect(r.color.kind).toBe('flat')
    expect(r.opacity).toBe(1)
    expect(r.id).toBeTruthy()
  })

  it('adds, replaces, and removes without mutating the input', () => {
    const base = [rule('a'), rule('b')]
    expect(withAddedRule(base, rule('c'))).toHaveLength(3)
    expect(base).toHaveLength(2)
    // withAddedRules appends many at once (used by "Generate a random coloring")
    expect(withAddedRules(base, [rule('c'), rule('d')]).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(base).toHaveLength(2)
    const replaced = withReplacedRule(base, 'b', { ...rule('b'), opacity: 0.5 })
    expect(replaced[1].opacity).toBe(0.5)
    expect(withRemovedRule(base, 'a')).toEqual([rule('b')])
  })

  it('duplicates a rule right after it, with a fresh id and equal content', () => {
    const base = [rule('a'), rule('b'), rule('c')]
    const next = withDuplicatedRule(base, 'b', 'b-copy')
    expect(next.map((r) => r.id)).toEqual(['a', 'b', 'b-copy', 'c']) // inserted directly after 'b'
    expect(base).toHaveLength(3) // input untouched
    const copy = next[2]
    expect(copy.id).toBe('b-copy')
    expect(copy.predicate).toEqual(base[1].predicate)
    expect(copy.color).toEqual(base[1].color)
    // Unknown id: unchanged (copied) list.
    expect(withDuplicatedRule(base, 'nope', 'x').map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('deep-clones a ramp so the copy does not share the original stops array', () => {
    const ramp: ColoringRule = {
      id: 'r',
      predicate: { kind: 'inline', text: 'visited > 0' },
      color: { kind: 'ramp', ramp: { attr: 'visited', mod: 6, stops: [{ hex: '#000', at: null }, { hex: '#fff', at: null }] } },
      opacity: 1,
    }
    const [orig, copy] = withDuplicatedRule([ramp], 'r', 'r2')
    expect(copy.color).toEqual(orig.color)
    if (orig.color.kind === 'ramp' && copy.color.kind === 'ramp') {
      expect(copy.color.ramp.stops).not.toBe(orig.color.ramp.stops)
      expect(copy.color.ramp.stops[0]).not.toBe(orig.color.ramp.stops[0])
    }
  })

  it('reorders by moving from -> to', () => {
    const base = [rule('a'), rule('b'), rule('c')]
    expect(withReordered(base, 0, 2).map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(withReordered(base, 2, 0).map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(withReordered(base, 1, 1).map((r) => r.id)).toEqual(['a', 'b', 'c']) // no-op
    expect(withReordered(base, 0, 9).map((r) => r.id)).toEqual(['a', 'b', 'c']) // out of range
  })
})
