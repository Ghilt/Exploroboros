import { describe, it, expect } from 'vitest'
import {
  EMPTY_TILE_STATE,
  MANUAL_STEP,
  addVisit,
  applyPaint,
  bumpRegistry,
  overlayIsEmpty,
  removeManualVisit,
  tileState,
  visitCount,
  type TileState,
} from './overlay'

describe('tileState / visitCount', () => {
  it('returns the shared empty state for an unknown tile, count 0', () => {
    const overlay = new Map<string, TileState>()
    expect(tileState(overlay, 't1')).toBe(EMPTY_TILE_STATE)
    expect(visitCount(tileState(overlay, 't1'))).toBe(0)
  })
})

describe('addVisit', () => {
  it('appends a step; count is the list length; default step is -1', () => {
    let o = new Map<string, TileState>()
    o = addVisit(o, 't1')
    o = addVisit(o, 't1', 3)
    expect(o.get('t1')!.visits).toEqual([MANUAL_STEP, 3])
    expect(visitCount(o.get('t1')!)).toBe(2)
  })
  it('does not mutate the input map', () => {
    const before = new Map<string, TileState>()
    const after = addVisit(before, 't1', 5)
    expect(before.has('t1')).toBe(false)
    expect(after).not.toBe(before)
  })
})

describe('removeManualVisit', () => {
  it('drops only the most recent step -1, keeping traverser steps', () => {
    let o = new Map<string, TileState>()
    o = addVisit(o, 't1', 2) // traverser visit
    o = addVisit(o, 't1') // manual -1
    o = addVisit(o, 't1', 4) // traverser visit
    o = removeManualVisit(o, 't1')
    expect(o.get('t1')!.visits).toEqual([2, 4])
  })
  it('is a no-op when the tile has no manual visit', () => {
    let o = addVisit(new Map<string, TileState>(), 't1', 2)
    o = removeManualVisit(o, 't1')
    expect(o.get('t1')!.visits).toEqual([2])
  })
  it('is a no-op for an unknown tile', () => {
    const o = removeManualVisit(new Map<string, TileState>(), 'nope')
    expect(o.has('nope')).toBe(false)
  })
})

describe('bumpRegistry', () => {
  it('raises and clamps at 0', () => {
    let o = bumpRegistry(new Map<string, TileState>(), 't1', 'b', 2)
    expect(o.get('t1')!.b).toBe(2)
    o = bumpRegistry(o, 't1', 'b', -5)
    expect(o.get('t1')!.b).toBe(0)
  })
  it('touches only the named registry', () => {
    const o = bumpRegistry(new Map<string, TileState>(), 't1', 'c', 1)
    const s = o.get('t1')!
    expect([s.a, s.b, s.c]).toEqual([0, 0, 1])
  })
})

describe('applyPaint', () => {
  it('a visited stroke appends step -1 to each tile', () => {
    const o = applyPaint(new Map<string, TileState>(), ['t1', 't2'], 'visited')
    expect(o.get('t1')!.visits).toEqual([MANUAL_STEP])
    expect(o.get('t2')!.visits).toEqual([MANUAL_STEP])
  })
  it('a registry stroke bumps that counter by 1 on each tile, leaving visits alone', () => {
    let o = applyPaint(new Map<string, TileState>(), ['t1'], 'a')
    o = applyPaint(o, ['t1'], 'a')
    expect(o.get('t1')!.a).toBe(2)
    expect(o.get('t1')!.visits).toEqual([])
  })
  it('an empty id list leaves the overlay unchanged', () => {
    const before = addVisit(new Map<string, TileState>(), 't1')
    const after = applyPaint(before, [], 'visited')
    expect(after.get('t1')!.visits).toEqual([MANUAL_STEP])
  })
})

describe('overlayIsEmpty', () => {
  it('true for a blank overlay, false once a visit or counter is set', () => {
    expect(overlayIsEmpty(new Map<string, TileState>())).toBe(true)
    expect(overlayIsEmpty(addVisit(new Map<string, TileState>(), 't1'))).toBe(false)
    expect(overlayIsEmpty(bumpRegistry(new Map<string, TileState>(), 't1', 'a', 1))).toBe(false)
  })
})
