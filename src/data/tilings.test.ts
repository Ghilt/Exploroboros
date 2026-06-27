import { describe, it, expect } from 'vitest'
import { TILINGS, getTiling } from './tilings'

describe('tiling catalog', () => {
  it('has unique ids and enough entries to fill the gallery', () => {
    const ids = TILINGS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(TILINGS.length).toBeGreaterThanOrEqual(9)
  })

  it('square and kalleboda are ready, with planned tilings still listed', () => {
    const ready = TILINGS.filter((t) => t.status === 'ready').map((t) => t.id)
    expect(ready).toContain('square')
    expect(ready).toContain('kalleboda')
    expect(ready).toContain('triangular')
    expect(ready).toContain('hexagonal')
    expect(ready).toContain('truncated-square')
    expect(ready).toContain('trihexagonal')
    expect(TILINGS.some((t) => t.status === 'planned')).toBe(true)
  })

  it('looks up entries by id', () => {
    expect(getTiling('square')?.name).toBe('Square')
    expect(getTiling('nope')).toBeUndefined()
  })
})
