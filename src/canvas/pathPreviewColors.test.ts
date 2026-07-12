import { describe, it, expect } from 'vitest'
import { pathPreviewColors, colorForLine } from './pathPreviewColors'

describe('pathPreviewColors', () => {
  it('offers ~10 distinct colours', () => {
    const cols = pathPreviewColors()
    expect(cols.length).toBeGreaterThanOrEqual(8)
    expect(new Set(cols).size).toBe(cols.length) // all distinct
  })

  it('colorForLine cycles through the palette', () => {
    const cols = pathPreviewColors()
    const n = cols.length
    expect(colorForLine(0)).toBe(cols[0])
    expect(colorForLine(1)).toBe(cols[1])
    expect(colorForLine(n)).toBe(cols[0]) // wraps
    expect(colorForLine(n + 3)).toBe(cols[3])
  })

  it('wraps negative line numbers', () => {
    const cols = pathPreviewColors()
    expect(colorForLine(-1)).toBe(cols[cols.length - 1])
  })

  it('the same line always maps to the same colour (so list elements share)', () => {
    expect(colorForLine(4)).toBe(colorForLine(4))
  })
})
