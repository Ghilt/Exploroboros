import { describe, it, expect } from 'vitest'
import { TILINGS, getTiling } from './tilings'

describe('tiling catalog', () => {
  it('has unique ids and enough entries to fill the gallery', () => {
    const ids = TILINGS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(TILINGS.length).toBeGreaterThanOrEqual(9)
  })

  it('square is the only ready tiling and octagon-wedge is a preview', () => {
    expect(TILINGS.filter((t) => t.status === 'ready').map((t) => t.id)).toEqual(['square'])
    expect(getTiling('octagon-wedge')?.status).toBe('preview')
  })

  it('looks up entries by id', () => {
    expect(getTiling('square')?.name).toBe('Square')
    expect(getTiling('nope')).toBeUndefined()
  })
})
