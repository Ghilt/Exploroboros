import { describe, it, expect } from 'vitest'
import { TILINGS, getTiling } from './tilings'

describe('tiling catalog', () => {
  it('has unique ids and enough entries to fill the gallery', () => {
    const ids = TILINGS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(TILINGS.length).toBeGreaterThanOrEqual(9)
  })

  it('every catalog tiling is ready — all 11 uniform tilings + kalleboda have generators', () => {
    const ready = TILINGS.filter((t) => t.status === 'ready').map((t) => t.id)
    for (const id of [
      'square',
      'kalleboda',
      'triangular',
      'hexagonal',
      'truncated-square',
      'trihexagonal',
      'elongated-triangular',
      'truncated-hexagonal',
      'rhombitrihexagonal',
      'truncated-trihexagonal',
      'snub-square',
      'snub-hexagonal',
    ]) {
      expect(ready).toContain(id)
    }
    // The whole target set is built — nothing left as a planned/preview placeholder.
    expect(ready.length).toBe(TILINGS.length)
  })

  it('looks up entries by id', () => {
    expect(getTiling('square')?.name).toBe('Square')
    expect(getTiling('nope')).toBeUndefined()
  })
})
