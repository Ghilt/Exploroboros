import { describe, it, expect } from 'vitest'
import { clipFromTile, canPaste, applyClip } from './clipboard'

describe('clipFromTile', () => {
  it('captures shape + visited', () => {
    expect(clipFromTile('square', 5)).toEqual({ shape: 'square', attrs: { visited: 5 } })
  })
})

describe('canPaste', () => {
  const clip = clipFromTile('square', 3)
  it('requires a clip and a matching shape class', () => {
    expect(canPaste(null, 'square')).toBe(false)
    expect(canPaste(clip, 'square')).toBe(true)
    expect(canPaste(clip, 'octagon')).toBe(false)
  })
})

describe('applyClip', () => {
  it('sets the target visited and does not mutate the input map', () => {
    const before = new Map<string, number>([['sq:0,0', 1]])
    const after = applyClip(before, 'sq:1,1', clipFromTile('square', 7))
    expect(after.get('sq:1,1')).toBe(7)
    expect(after.get('sq:0,0')).toBe(1)
    expect(before.has('sq:1,1')).toBe(false) // original untouched
  })
})
