import { describe, it, expect } from 'vitest'
import { buildDictionary, isWord, isPrefix } from './dictionary'

const dict = buildDictionary(['cat', 'car', 'card', 'dog'])

describe('dictionary trie', () => {
  it('finds whole words (case-insensitive)', () => {
    expect(isWord(dict, 'cat')).toBe(true)
    expect(isWord(dict, 'CAR')).toBe(true)
    expect(isWord(dict, 'CaRd')).toBe(true)
  })

  it('rejects non-words', () => {
    expect(isWord(dict, 'ca')).toBe(false) // a prefix, not a word
    expect(isWord(dict, 'cab')).toBe(false)
    expect(isWord(dict, 'z')).toBe(false)
    expect(isWord(dict, '')).toBe(false)
  })

  it('detects live prefixes vs dead ends', () => {
    expect(isPrefix(dict, 'ca')).toBe(true)
    expect(isPrefix(dict, 'car')).toBe(true)
    expect(isPrefix(dict, 'card')).toBe(true)
    expect(isPrefix(dict, 'cx')).toBe(false) // dead end — no word starts "cx"
    expect(isPrefix(dict, 'cats')).toBe(false)
    expect(isPrefix(dict, '')).toBe(true)
  })
})
