import { describe, it, expect } from 'vitest'
import { dailyBoard, wordScore, utcDateKey, seedFromDateKey, mulberry32 } from './board'

describe('word-game board', () => {
  it('is deterministic for a given date key', () => {
    const a = dailyBoard('2026-07-18')
    const b = dailyBoard('2026-07-18')
    expect(a.tilingId).toBe(b.tilingId)
    expect([...a.letters.entries()]).toEqual([...b.letters.entries()])
  })

  it('differs across dates (tiling and/or letters)', () => {
    const a = dailyBoard('2026-07-18')
    const b = dailyBoard('2026-07-19')
    const identical = a.tilingId === b.tilingId && JSON.stringify([...a.letters]) === JSON.stringify([...b.letters])
    expect(identical).toBe(false)
  })

  it('puts one A–Z letter on every tile', () => {
    const board = dailyBoard('2026-07-18')
    expect(board.letters.size).toBe(board.tiling.nodes.length)
    for (const node of board.tiling.nodes) {
      expect(board.letters.get(node.id)).toMatch(/^[A-Z]$/)
    }
  })

  it('scores words by Scrabble letter values (case-insensitive)', () => {
    expect(wordScore('QUIZ')).toBe(10 + 1 + 1 + 10) // Q10 U1 I1 Z10
    expect(wordScore('cat')).toBe(3 + 1 + 1) // C3 A1 T1 — also proves case-insensitivity
  })

  it('utcDateKey formats YYYY-MM-DD in UTC', () => {
    expect(utcDateKey(new Date(Date.UTC(2026, 6, 8)))).toBe('2026-07-08')
  })

  it('mulberry32 is a stable stream for a seed', () => {
    const r1 = mulberry32(seedFromDateKey('x'))
    const r2 = mulberry32(seedFromDateKey('x'))
    expect(r1()).toBe(r2())
    expect(r1()).toBe(r2())
  })
})
