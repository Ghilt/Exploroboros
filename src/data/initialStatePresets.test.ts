import { describe, expect, it } from 'vitest'
import { INITIAL_STATE_PRESETS, appendPreset } from './initialStatePresets'
import { compileDoc } from '../initstate'

describe('initial-state presets', () => {
  it('every preset parses as a valid Initial-state document', () => {
    for (const p of INITIAL_STATE_PRESETS) {
      const r = compileDoc(p.text, new Map())
      expect(r.ok, `${p.name}: ${r.ok ? '' : r.error.message}`).toBe(true)
    }
  })

  it('offers the three named presets', () => {
    expect(INITIAL_STATE_PRESETS.map((p) => p.name)).toEqual(['Edges', 'Cross', 'Diagonal cross'])
  })
})

describe('appendPreset', () => {
  it('sets the text when the document is empty', () => {
    expect(appendPreset('', 'A\nB')).toBe('A\nB')
    expect(appendPreset('   ', 'A')).toBe('A') // whitespace-only counts as empty
  })

  it('appends after a single newline when there is existing text', () => {
    expect(appendPreset('X', 'A\nB')).toBe('X\nA\nB')
    expect(appendPreset('X\n', 'A')).toBe('X\nA') // collapses trailing newlines to one
    expect(appendPreset('X\n\n', 'A')).toBe('X\nA')
  })
})
