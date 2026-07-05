import { describe, it, expect } from 'vitest'
import { sanitizeName, malformedNameError, VALID_NAME } from './names'

describe('sanitizeName', () => {
  it('collapses runs of illegal chars (incl. spaces) into a single _', () => {
    expect(sanitizeName('Has A')).toBe('Has_A')
    expect(sanitizeName('Has  A')).toBe('Has_A')
    expect(sanitizeName('my cool pred')).toBe('my_cool_pred')
    expect(sanitizeName('a/b!c')).toBe('a_b_c')
  })

  it('is a no-op on an already-valid name', () => {
    for (const n of ['Has_A', 'isCrowded', 'first-step', 'Level_2', 'rule3', 'a-b-c']) {
      expect(sanitizeName(n)).toBe(n)
    }
  })

  it('is idempotent', () => {
    const once = sanitizeName('Has A / B')
    expect(sanitizeName(once)).toBe(once)
  })

  it('keeps hyphens and underscores', () => {
    expect(sanitizeName('adjacent-visited')).toBe('adjacent-visited')
    expect(sanitizeName('Has_A')).toBe('Has_A')
  })
})

describe('malformedNameError', () => {
  it('accepts valid identifier names', () => {
    for (const n of ['Has_A', 'isCrowded', 'first-step', 'Level_2', 'rule3', 'a']) {
      expect(malformedNameError(n)).toBeNull()
    }
  })

  it('rejects names with spaces, pointing at _', () => {
    expect(malformedNameError('Has A')).toMatch(/can't contain spaces/)
    expect(malformedNameError('Has A')).toMatch(/Has_A/)
  })

  it('rejects illegal punctuation and a bad start', () => {
    expect(malformedNameError('a/b')).toMatch(/letters, digits/)
    expect(malformedNameError('2cool')).toMatch(/letters, digits/) // must start with a letter
    expect(malformedNameError('foo-')).toMatch(/letters, digits/) // trailing hyphen isn't one token
  })

  it('treats an empty / whitespace-only name as not-an-error (auto-name handles it)', () => {
    expect(malformedNameError('')).toBeNull()
    expect(malformedNameError('   ')).toBeNull()
  })
})

describe('VALID_NAME mirrors the lexer identifier rule', () => {
  it('accepts letters/digits/underscores with hyphens only before a letter', () => {
    expect(VALID_NAME.test('Has_A')).toBe(true)
    expect(VALID_NAME.test('first-step')).toBe(true)
    expect(VALID_NAME.test('Level_2')).toBe(true)
    expect(VALID_NAME.test('first-2')).toBe(false) // hyphen before a digit isn't one token
    expect(VALID_NAME.test('Has A')).toBe(false)
  })
})
