import { describe, it, expect } from 'vitest'
import { ATTRIBUTES, attrSpec } from './attributes'

describe('attribute registry', () => {
  it('has exactly one spec per attribute name', () => {
    const names = ATTRIBUTES.map((a) => a.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('marks the indexed attributes', () => {
    const indexed = ATTRIBUTES.filter((a) => a.indexed)
      .map((a) => a.name)
      .sort()
    expect(indexed).toEqual(['coordinate', 'step'])
  })

  it('marks the attributes that require a default', () => {
    const needsDefault = ATTRIBUTES.filter((a) => a.needsDefault)
      .map((a) => a.name)
      .sort()
    expect(needsDefault).toEqual(['coordinate', 'first-step', 'latest-step', 'step'])
  })

  it('includes the rotation attribute (numeric, always defined)', () => {
    const rot = attrSpec('rotation')
    expect(rot).toBeDefined()
    expect(rot?.indexed).toBe(false)
    expect(rot?.needsDefault).toBe(false)
  })

  it('looks up by keyword and rejects unknown names', () => {
    expect(attrSpec('visited')?.name).toBe('visited')
    expect(attrSpec('nope')).toBeUndefined()
  })
})
