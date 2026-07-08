import { describe, expect, it } from 'vitest'
import { buildDslCompletions, TRAVERSER_STARTERS, INIT_STARTERS } from './dslCompletions'

describe('buildDslCompletions', () => {
  it('always offers tile attributes plus tile-type', () => {
    const c = buildDslCompletions({})
    const values = c.map((x) => x.value)
    expect(values).toContain('visited')
    expect(values).toContain('visited-neighbors')
    expect(values).toContain('orientation')
    expect(values).toContain('tile-type')
    // all tile-scope entries are labelled as attributes
    expect(c.find((x) => x.value === 'visited')?.kind).toBe('attribute')
  })

  it('marks indexed attributes with a "takes [n]" hint', () => {
    const c = buildDslCompletions({})
    expect(c.find((x) => x.value === 'coordinate')?.hint).toBe('takes [n]')
    expect(c.find((x) => x.value === 'step')?.hint).toBe('takes [n]')
    expect(c.find((x) => x.value === 'visited')?.hint).toBeUndefined()
  })

  it('omits walker attributes unless includeTraverser is set', () => {
    const without = buildDslCompletions({}).map((x) => x.value)
    expect(without).not.toContain('heading')
    expect(without).not.toContain('steps')
    expect(without).not.toContain('P')

    const withWalker = buildDslCompletions({ includeTraverser: true })
    const values = withWalker.map((x) => x.value)
    expect(values).toContain('heading')
    expect(values).toContain('steps')
    expect(values).toContain('P')
    expect(withWalker.find((x) => x.value === 'heading')?.kind).toBe('walker')
  })

  it('adds predicate names as predicate-kind completions', () => {
    const names = new Map<string, string>([
      ['Has_A', '[A] > 0'],
      ['isCrowded', 'visited-neighbors > 2'],
    ])
    const c = buildDslCompletions({ predicateNames: names })
    const has = c.find((x) => x.value === 'Has_A')
    expect(has?.kind).toBe('predicate')
    expect(c.find((x) => x.value === 'isCrowded')?.kind).toBe('predicate')
  })

  it('does not exclude back-compat aliases only from the tile list (no duplicate visited-neighbors)', () => {
    const c = buildDslCompletions({})
    // The alias keywords (adjacent-visited-*) are hidden; only the canonical names appear once.
    expect(c.filter((x) => x.value === 'visited-neighbors')).toHaveLength(1)
    expect(c.map((x) => x.value)).not.toContain('adjacent-visited-unique')
  })

  it('offers "not" as a keyword for starting a negated predicate', () => {
    const not = buildDslCompletions({}).find((x) => x.value === 'not')
    expect(not?.kind).toBe('keyword')
  })

  it('offers the bare tile registries A/B/C as completions', () => {
    const values = buildDslCompletions({}).map((x) => x.value)
    expect(values).toContain('A')
    expect(values).toContain('B')
    expect(values).toContain('C')
  })
})

describe('statement-start keyword lists', () => {
  it('the traverser starters cover every line-starting keyword the parser accepts', () => {
    const values = TRAVERSER_STARTERS.map((s) => s.value)
    // The header settings, the guard, the actions, and the directive forms — nothing missing.
    for (const kw of [
      'if',
      'move',
      'put',
      'increase',
      'morph',
      'update',
      'directive',
      'reset directives',
      'find-tile',
      'find-lowest-tile',
      'find-highest-tile',
      'heading',
      'max-split',
      'max-steps',
      'movement',
    ]) {
      expect(values).toContain(kw)
    }
    expect(TRAVERSER_STARTERS.every((s) => s.kind === 'keyword')).toBe(true)
  })

  it('the initial-state starter is auto-place', () => {
    expect(INIT_STARTERS.map((s) => s.value)).toEqual(['auto-place'])
  })
})
