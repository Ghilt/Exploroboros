import { describe, it, expect, afterEach } from 'vitest'
import { loadStored, saveStored } from './persist'
import {
  autoNameOf,
  isSimple,
  makePredicate,
  withAdded,
  withRemoved,
  withRenamed,
  withSetText,
  type StoredPredicate,
} from './predicateStore'

afterEach(() => {
  localStorage.clear()
})

describe('autoNameOf / isSimple', () => {
  it('names a parseable predicate by its canonical DSL', () => {
    expect(autoNameOf('visited>0')).toBe('visited > 0')
    expect(autoNameOf('visited%2==1')).toBe('visited % 2 == 1')
  })
  it('falls back to the raw text when it does not parse', () => {
    expect(autoNameOf('visited >')).toBe('visited >')
  })
  it('treats a single comparison as simple, compound as not', () => {
    expect(isSimple('visited > 0')).toBe(true)
    expect(isSimple('visited > 0 and [A] > 0')).toBe(false)
    expect(isSimple('garbage')).toBe(false)
  })
})

describe('makePredicate', () => {
  it('auto-names when no name is given', () => {
    const p = makePredicate('visited>0')
    expect(p).toMatchObject({ name: 'visited > 0', text: 'visited>0', autoName: true })
    expect(p.id).toBeTruthy()
  })
  it('keeps a given name and turns auto-naming off', () => {
    const p = makePredicate('visited>0', 'My rule')
    expect(p).toMatchObject({ name: 'My rule', autoName: false })
  })
})

describe('pure list updaters', () => {
  const base: StoredPredicate[] = [{ id: 'x', name: 'visited > 0', text: 'visited > 0', autoName: true }]

  it('adds without mutating the input', () => {
    const next = withAdded(base, makePredicate('visited == 0'))
    expect(next).toHaveLength(2)
    expect(base).toHaveLength(1)
  })
  it('re-derives an auto-named predicate name when the text changes', () => {
    const next = withSetText(base, 'x', 'visited == 5')
    expect(next[0]).toMatchObject({ text: 'visited == 5', name: 'visited == 5' })
  })
  it('leaves a user-named predicate name alone when the text changes', () => {
    const named: StoredPredicate[] = [{ id: 'x', name: 'Mine', text: 'visited > 0', autoName: false }]
    const next = withSetText(named, 'x', 'visited == 5')
    expect(next[0]).toMatchObject({ text: 'visited == 5', name: 'Mine' })
  })
  it('renaming turns auto-naming off', () => {
    const next = withRenamed(base, 'x', 'Custom')
    expect(next[0]).toMatchObject({ name: 'Custom', autoName: false })
  })
  it('removes by id', () => {
    expect(withRemoved(base, 'x')).toHaveLength(0)
  })
})

describe('persistence round-trip', () => {
  it('saves and loads through localStorage', () => {
    const payload = { version: 1, predicates: makePredicate('visited > 0') }
    expect(saveStored('k', payload)).toBe(true)
    expect(loadStored('k', null)).toEqual(payload)
  })
  it('returns the fallback on corrupt JSON', () => {
    localStorage.setItem('k', '{not json')
    expect(loadStored('k', { version: 1, predicates: [] })).toEqual({ version: 1, predicates: [] })
  })
})
