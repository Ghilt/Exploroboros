import { describe, it, expect } from 'vitest'
import { buildDictionary } from './dictionary'
import { judgeWord } from './submit'

const dict = buildDictionary(['cat', 'card'])

describe('judgeWord', () => {
  it('accepts a valid, new word with its Scrabble value', () => {
    const j = judgeWord(dict, [], 'cat')
    expect(j).toEqual({ accept: true, reason: 'ok', value: 5 }) // C3 A1 T1
  })

  it('rejects words under the minimum length', () => {
    expect(judgeWord(dict, [], 'ca')).toMatchObject({ accept: false, reason: 'short' })
  })

  it('rejects words not in the dictionary', () => {
    expect(judgeWord(dict, [], 'dog')).toMatchObject({ accept: false, reason: 'unknown' })
  })

  it('rejects an already-found word (case-insensitive)', () => {
    expect(judgeWord(dict, ['CAT'], 'cat')).toMatchObject({ accept: false, reason: 'duplicate' })
  })
})
