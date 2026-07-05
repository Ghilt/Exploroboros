import { describe, it, expect } from 'vitest'
import { RESERVED_WORDS, reservedNameError } from './reserved'

describe('reservedNameError', () => {
  it('rejects DSL keywords across all three grammars', () => {
    const words = [
      'and', 'or', 'not', 'of', 'default', 'tile-type', // predicate
      'move', 'morph', 'put', 'increase', 'update', 'if', 'then', 'directive', 'forbid', 'allow', 'reset', // traverser
      'max-split', 'heading', 'movement', 'relative', 'absolute', 'straight', 'nearest-unvisited', // settings/edges
      'auto-place', 'line', 'blob', 'visited', // initial state
    ]
    for (const w of words) expect(reservedNameError(w), w).toBeTruthy()
  })

  it('rejects attribute + registry names', () => {
    for (const w of ['visited-neighbors', 'orientation', 'coordinate', 'steps', 'a', 'b', 'c', 'p', 'q', 'r']) {
      expect(reservedNameError(w), w).toBeTruthy()
    }
  })

  it('is case-insensitive', () => {
    expect(reservedNameError('AND')).toBeTruthy()
    expect(reservedNameError('Visited')).toBeTruthy()
    expect(reservedNameError('Move')).toBeTruthy()
  })

  it('rejects the positional reference patterns (t/e/r/l + integer)', () => {
    for (const w of ['t1', 't12', 'e0', 'e3', 'r1', 'l2', 'R5', 'E7', 'L10']) {
      expect(reservedNameError(w), w).toBeTruthy()
    }
  })

  it('allows ordinary identifier names', () => {
    for (const w of ['gasket', 'Has_A', 'spiral2', 'wave', 'Fractal', 'north-star', 'sierpinski', 't', 'row']) {
      expect(reservedNameError(w), w).toBeNull()
    }
  })

  it('rejects names with spaces or illegal characters (must be a bare identifier)', () => {
    expect(reservedNameError('my walker')).toMatch(/spaces/)
    expect(reservedNameError('Has A')).toMatch(/spaces/)
    expect(reservedNameError('a/b')).toMatch(/letters, digits/)
    expect(reservedNameError('2cool')).toMatch(/letters, digits/)
  })

  it('trims and treats an empty name as ok (it auto-names from the DSL text)', () => {
    expect(reservedNameError('')).toBeNull()
    expect(reservedNameError('   ')).toBeNull()
    expect(reservedNameError('  and  ')).toBeTruthy()
    expect(reservedNameError('  spiral  ')).toBeNull()
  })

  it('exposes the reserved set for reference', () => {
    expect(RESERVED_WORDS.has('move')).toBe(true)
    expect(RESERVED_WORDS.has('gasket')).toBe(false)
  })
})
