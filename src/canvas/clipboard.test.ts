import { describe, it, expect } from 'vitest'
import { clipFromTile, canPaste, applyClip } from './clipboard'
import type { TileState } from './overlay'

describe('clipFromTile', () => {
  it('captures shape + a snapshot of the state', () => {
    const src: TileState = { visits: [-1, 3], a: 1, b: 0, c: 2 }
    expect(clipFromTile('square', src)).toEqual({
      shape: 'square',
      state: { visits: [-1, 3], a: 1, b: 0, c: 2 },
    })
  })
  it('snapshots visits so a later edit to the source does not leak in', () => {
    const visits = [-1]
    const clip = clipFromTile('square', { visits, a: 0, b: 0, c: 0 })
    visits.push(5)
    expect(clip.state.visits).toEqual([-1])
  })
})

describe('canPaste', () => {
  const clip = clipFromTile('square', { visits: [], a: 0, b: 0, c: 0 })
  it('requires a clip and a matching shape class', () => {
    expect(canPaste(null, 'square')).toBe(false)
    expect(canPaste(clip, 'square')).toBe(true)
    expect(canPaste(clip, 'octagon')).toBe(false)
  })
})

describe('applyClip', () => {
  it('sets the target state and does not mutate the input map', () => {
    const before = new Map<string, TileState>([['sq:0,0', { visits: [-1], a: 0, b: 0, c: 0 }]])
    const clip = clipFromTile('square', { visits: [-1, -1], a: 2, b: 0, c: 1 })
    const after = applyClip(before, 'sq:1,1', clip)
    expect(after.get('sq:1,1')).toEqual({ visits: [-1, -1], a: 2, b: 0, c: 1 })
    expect(after.get('sq:0,0')).toEqual({ visits: [-1], a: 0, b: 0, c: 0 })
    expect(before.has('sq:1,1')).toBe(false) // original untouched
  })
  it('deep-copies visits so a second paste does not alias the first', () => {
    const clip = clipFromTile('square', { visits: [-1], a: 0, b: 0, c: 0 })
    const a = applyClip(new Map<string, TileState>(), 'x', clip)
    const b = applyClip(a, 'y', clip)
    expect(a.get('x')!.visits).not.toBe(b.get('y')!.visits)
  })
})
