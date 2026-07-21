// The daily word-game board: a deterministic-per-date tiling with a letter on every tile. Pure and
// isomorphic (no DOM/React), so the same code can run on the server later to publish the day's seed
// (the design serves a thin seed the client rebuilds from). Letters come from an English
// letter-frequency bag; a real dictionary, a vowel floor, and scoring RULES are later iterations.

import type { Tiling } from '../tiling'
import { buildTiling } from '../canvas/buildTiling'

// --- deterministic RNG -----------------------------------------------------------------------------

// A tiny seedable PRNG (mulberry32): a pure uint32 -> [0,1) stream, so a given seed always yields the
// same board. Math.random is unusable here — the daily board must be identical for every player.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// FNV-1a hash of a date key -> a uint32 seed.
export function seedFromDateKey(dateKey: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < dateKey.length; i += 1) {
    h ^= dateKey.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// The UTC date key "YYYY-MM-DD" for a moment. UTC so the board rolls over at the same instant for
// everyone (one shared board per calendar day, UTC).
export function utcDateKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// --- letters + scoring -----------------------------------------------------------------------------

// English/Scrabble letter frequencies (counts out of the 98 lettered tiles), used as draw WEIGHTS so a
// random board reads like English rather than a uniform alphabet soup. Blanks are omitted — every tile
// gets a real letter.
const LETTER_FREQ: ReadonlyArray<readonly [string, number]> = [
  ['E', 12], ['A', 9], ['I', 9], ['O', 8], ['N', 6], ['R', 6], ['T', 6], ['L', 4], ['S', 4], ['U', 4],
  ['D', 4], ['G', 3], ['B', 2], ['C', 2], ['M', 2], ['P', 2], ['F', 2], ['H', 2], ['V', 2], ['W', 2],
  ['Y', 2], ['K', 1], ['J', 1], ['X', 1], ['Q', 1], ['Z', 1],
]

// Flattened weighted bag ("EEE…AAA…"), built once, sampled with replacement per tile.
const LETTER_BAG: string = LETTER_FREQ.map(([ch, n]) => ch.repeat(n)).join('')

// Standard Scrabble letter values.
const LETTER_SCORE: Readonly<Record<string, number>> = {
  A: 1, E: 1, I: 1, O: 1, U: 1, L: 1, N: 1, S: 1, T: 1, R: 1,
  D: 2, G: 2,
  B: 3, C: 3, M: 3, P: 3,
  F: 4, H: 4, V: 4, W: 4, Y: 4,
  K: 5,
  J: 8, X: 8,
  Q: 10, Z: 10,
}

export function letterScore(ch: string): number {
  return LETTER_SCORE[ch.toUpperCase()] ?? 0
}

// The Scrabble letter-sum of a word — no board/length bonuses (scoring RULES are a later iteration).
export function wordScore(word: string): number {
  let sum = 0
  for (const ch of word) sum += letterScore(ch)
  return sum
}

// --- the board -------------------------------------------------------------------------------------

// The curated tilings the daily rotates through. Counts are provisional (tuned by eye) to land a board
// that's comfortable to read; a precise "rectangle clipped to a target tile count" is a later
// refinement — for now each tiling's natural generated patch IS the board.
type BoardTiling = { id: string; label: string; count: number }
// Count 10 lands each of these near ~100 tiles (square 10x10 = 100; the others 98–113), a substantial
// but readable board. Easy to retune per tiling once seen on a device.
const CURATED: ReadonlyArray<BoardTiling> = [
  { id: 'square', label: 'Square', count: 10 },
  { id: 'hexagonal', label: 'Hexagonal', count: 10 },
  { id: 'triangular', label: 'Triangular', count: 10 },
  { id: 'trihexagonal', label: 'Trihexagonal', count: 10 },
  { id: 'truncated-square', label: 'Truncated square', count: 10 },
  { id: 'rhombille', label: 'Rhombille', count: 10 },
]

export type DailyBoard = {
  dateKey: string
  tilingId: string
  label: string
  tiling: Tiling
  letters: Map<string, string> // tile id -> uppercase letter
}

// Build the whole day's board from its date key: pick the tiling, then fill every tile with a letter —
// all from ONE seeded stream, so it's identical for everyone on that date.
export function dailyBoard(dateKey: string): DailyBoard {
  const rng = mulberry32(seedFromDateKey(dateKey))
  const pick = CURATED[Math.floor(rng() * CURATED.length)]
  const tiling = buildTiling(pick.id, pick.count)
  const letters = new Map<string, string>()
  for (const node of tiling.nodes) {
    letters.set(node.id, LETTER_BAG[Math.floor(rng() * LETTER_BAG.length)])
  }
  return { dateKey, tilingId: pick.id, label: pick.label, tiling, letters }
}
