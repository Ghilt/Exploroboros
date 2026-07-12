import { describe, it, expect } from 'vitest'
import { isWholeProgram, occurrenceInSelection, buildPathPreview, lineColorsFor, type PathPreviewEntry } from './pathPreviewSelect'
import type { PathOccurrence } from '../traverse'

// A minimal occurrence — the select helpers only read span + line (base/refs/text are for resolveWalk).
const occ = (start: number, end: number, line: number, text = ''): PathOccurrence => ({
  span: { start, end },
  line,
  base: { kind: 'current' },
  refs: [{ kind: 'straight' }],
  text,
})
const color = (line: number) => `c${line}`

describe('isWholeProgram', () => {
  it('is true for a 0..len selection', () => {
    expect(isWholeProgram({ start: 0, end: 10 }, 10)).toBe(true)
    expect(isWholeProgram({ start: 0, end: 12 }, 10)).toBe(true) // trailing selection past len still counts
  })
  it('is false for a partial selection', () => {
    expect(isWholeProgram({ start: 2, end: 10 }, 10)).toBe(false)
    expect(isWholeProgram({ start: 0, end: 8 }, 10)).toBe(false)
  })
})

describe('occurrenceInSelection', () => {
  it('a collapsed caret lights nothing', () => {
    expect(occurrenceInSelection({ start: 2, end: 6 }, { start: 4, end: 4 }, 20)).toBe(false)
  })
  it('a partial overlap lights the occurrence', () => {
    expect(occurrenceInSelection({ start: 2, end: 6 }, { start: 5, end: 9 }, 20)).toBe(true)
  })
  it('a touching boundary does NOT count (half-open)', () => {
    expect(occurrenceInSelection({ start: 2, end: 6 }, { start: 6, end: 9 }, 20)).toBe(false)
    expect(occurrenceInSelection({ start: 6, end: 9 }, { start: 2, end: 6 }, 20)).toBe(false)
  })
  it('whole-program lights every occurrence, even a collapsed-looking one', () => {
    expect(occurrenceInSelection({ start: 2, end: 6 }, { start: 0, end: 20 }, 20)).toBe(true)
  })
})

describe('buildPathPreview', () => {
  const occs = [occ(0, 5, 0, 'a'), occ(6, 11, 0, 'b'), occ(12, 17, 1, 'c')]
  // stub resolver: 'a' -> two tiles, 'b' -> unresolvable (empty), 'c' -> one tile
  const resolve = (o: PathOccurrence): string[] => (o.text === 'a' ? ['t0', 't1'] : o.text === 'c' ? ['t9'] : [])

  it('filters to the selection, drops empty walks, colours per line', () => {
    const entries = buildPathPreview(occs, { start: 0, end: 5 }, 17, resolve, color)
    expect(entries).toEqual<PathPreviewEntry[]>([{ tiles: ['t0', 't1'], color: 'c0', line: 0 }])
  })

  it('whole-program includes every resolvable occurrence', () => {
    const entries = buildPathPreview(occs, { start: 0, end: 17 }, 17, resolve, color)
    // 'a' (line 0) and 'c' (line 1) resolve; 'b' resolves empty -> dropped.
    expect(entries.map((e) => e.line)).toEqual([0, 1])
    expect(entries.map((e) => e.color)).toEqual(['c0', 'c1'])
  })

  it('same-line occurrences share a colour', () => {
    const two = [occ(0, 5, 3, 'a'), occ(6, 11, 3, 'c2')]
    const r = (o: PathOccurrence): string[] => (o.text === 'a' ? ['x'] : ['y'])
    const entries = buildPathPreview(two, { start: 0, end: 11 }, 11, r, color)
    expect(entries.map((e) => e.color)).toEqual(['c3', 'c3'])
  })
})

describe('lineColorsFor', () => {
  const entries: PathPreviewEntry[] = [
    { tiles: ['a'], color: 'c0', line: 0 },
    { tiles: ['b'], color: 'c0', line: 0 },
    { tiles: ['c'], color: 'c2', line: 2 },
  ]
  it('is empty outside whole-program mode', () => {
    expect(lineColorsFor(entries, { start: 0, end: 3 }, 10).size).toBe(0)
  })
  it('maps each illuminated line once in whole-program mode', () => {
    const m = lineColorsFor(entries, { start: 0, end: 10 }, 10)
    expect(m.size).toBe(2)
    expect(m.get(0)).toBe('c0')
    expect(m.get(2)).toBe('c2')
  })
})
