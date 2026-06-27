import { describe, it, expect } from 'vitest'
import { tilesAlongSegment } from './stroke'
import { squareTiling } from '../tiling'

describe('tilesAlongSegment', () => {
  const t = squareTiling(5, 5)

  it('paints a contiguous trail across a row with no gaps or dupes', () => {
    const ids = tilesAlongSegment(t, { x: 0.5, y: 0.5 }, { x: 4.5, y: 0.5 })
    expect(ids).toEqual(['sq:0,0', 'sq:0,1', 'sq:0,2', 'sq:0,3', 'sq:0,4'])
  })

  it('paints a contiguous diagonal trail', () => {
    const ids = tilesAlongSegment(t, { x: 0.5, y: 0.5 }, { x: 4.5, y: 4.5 })
    expect(ids[0]).toBe('sq:0,0')
    expect(ids[ids.length - 1]).toBe('sq:4,4')
    expect(new Set(ids).size).toBe(ids.length) // no consecutive dupes collapsed to repeats
  })

  it('returns a single tile when start and end are the same point', () => {
    expect(tilesAlongSegment(t, { x: 2.5, y: 2.5 }, { x: 2.5, y: 2.5 })).toEqual(['sq:2,2'])
  })
})
