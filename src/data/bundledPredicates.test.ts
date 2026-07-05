import { describe, it, expect } from 'vitest'
import { BUNDLED_PREDICATES } from './bundledPredicates'
import { parsePredicate, malformedNameError, VALID_NAME } from '../dsl'

describe('BUNDLED_PREDICATES', () => {
  it('every preset text parses', () => {
    for (const p of BUNDLED_PREDICATES) {
      expect(parsePredicate(p.text).ok, `${p.name}: ${p.text}`).toBe(true)
    }
  })

  it('every preset NAME is a well-formed identifier (no spaces / illegal chars)', () => {
    // Presets are shown in the dropdown AND can be referenced by name in an inline predicate / guard
    // (`Visited_neighbor and Has_A`), so each name must be a single identifier — never a space-y label. (A
    // name MAY still collide with a reserved attribute word, e.g. "Visited" vs `visited` — that just
    // means you'd write the attribute inline instead of referencing that preset by name; not a defect.)
    for (const p of BUNDLED_PREDICATES) {
      expect(VALID_NAME.test(p.name), `${p.name} should be a valid identifier`).toBe(true)
      expect(malformedNameError(p.name), `${p.name} should have no spaces / illegal chars`).toBeNull()
    }
  })

  it('has unique ids and names', () => {
    const ids = BUNDLED_PREDICATES.map((p) => p.id)
    const names = BUNDLED_PREDICATES.map((p) => p.name.toLowerCase())
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })
})
