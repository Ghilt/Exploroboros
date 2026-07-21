import type { Dictionary } from './dictionary'
import { isWord } from './dictionary'
import { wordScore } from './board'

// Shortest accepted word. (NWL has 2-letter words, but the daily uses a 3-letter minimum for now —
// this is the single knob to change that.)
export const MIN_WORD_LENGTH = 3

export type WordJudgement = {
  accept: boolean
  reason: 'ok' | 'short' | 'unknown' | 'duplicate'
  value: number
}

// Decide a submitted word: too short, already found, not in the dictionary, or accepted (with its
// Scrabble letter-sum). Pure, so the whole accept/reject rule set is unit-tested independently of the
// canvas + React wiring.
export function judgeWord(dict: Dictionary, foundWords: ReadonlyArray<string>, word: string): WordJudgement {
  const w = word.toUpperCase()
  if (w.length < MIN_WORD_LENGTH) return { accept: false, reason: 'short', value: 0 }
  if (foundWords.some((f) => f.toUpperCase() === w)) return { accept: false, reason: 'duplicate', value: 0 }
  if (!isWord(dict, w)) return { accept: false, reason: 'unknown', value: 0 }
  return { accept: true, reason: 'ok', value: wordScore(w) }
}
