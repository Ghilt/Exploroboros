import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import type { TileState } from '../canvas'
import { nodeById } from '../tiling'
import { compileProgram, type Program, type Traverser } from '../traverse'
import { compileDoc } from './compile'
import { applyInitWrites, mergeByTile, resolveInitialState, type InitWrite } from './resolve'
import type { Doc } from './types'

const EMPTY = new Map<string, never>()

function def(text: string): Program {
  const c = compileProgram(text, new Map())
  if (!c.ok) throw new Error(c.error.message)
  return c.value
}

function doc(src: string): Doc {
  const r = compileDoc(src, new Map())
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('resolveInitialState — traversers', () => {
  const t = buildTiling('square', 6)
  const defs = new Map([['walker', def('move nearest-unvisited')]])

  it('places a traverser by number t1, aimed at param % sides', () => {
    const res = resolveInitialState(doc('auto-place line {t1, 0, 0, 3}'), t, ['walker'], defs, EMPTY, EMPTY)
    expect(res.seeds).toHaveLength(6)
    expect(res.seeds.every((s) => s.def === 'walker')).toBe(true)
    expect(res.seeds.every((s) => s.heading === 3)).toBe(true) // 3 % 4 sides
  })

  it('places a traverser by name, inheriting the def settings', () => {
    const withSettings = new Map([['walker', def('max-split = 3\nmove nearest-unvisited')]])
    const res = resolveInitialState(doc('auto-place line {walker, 0, 0, 0}'), t, ['walker'], withSettings, EMPTY, EMPTY)
    expect(res.seeds[0].maxSplit).toBe(3)
  })

  it('collects unknown refs and places nothing for them', () => {
    const res = resolveInitialState(doc('auto-place line {t5, 0, 0, 0}'), t, ['walker'], defs, EMPTY, EMPTY)
    expect(res.seeds).toHaveLength(0)
    expect(res.unknownRefs).toContain('t5')
  })

  it('one walker per tile — the first traverser placement wins a shared tile', () => {
    const defs2 = new Map([
      ['a', def('move nearest-unvisited')],
      ['b', def('move nearest-unvisited')],
    ])
    const res = resolveInitialState(
      doc('auto-place line {a, 0, 0, 0}\nauto-place line {b, 0, 0, 2}'),
      t,
      ['a', 'b'],
      defs2,
      EMPTY,
      EMPTY,
    )
    expect(res.seeds).toHaveLength(6) // the top row once, not 12
    expect(res.seeds.every((s) => s.def === 'a')).toBe(true)
  })
})

describe('resolveInitialState — registry / visited set-writes', () => {
  const t = buildTiling('square', 6)

  it('sets a registry to param on each chosen tile', () => {
    const res = resolveInitialState(doc('auto-place line {[A], 0, 0, 5}'), t, [], new Map(), EMPTY, EMPTY)
    expect(res.seeds).toHaveLength(0)
    expect(res.writes).toHaveLength(6)
    expect(res.writes.every((w) => w.kind === 'reg' && w.reg === 'a' && w.value === 5)).toBe(true)
  })

  it('sets visited to max(1, param) marks', () => {
    const many = resolveInitialState(doc('auto-place line {visited, 0, 0, 3}'), t, [], new Map(), EMPTY, EMPTY)
    expect(many.writes.every((w) => w.kind === 'visited' && w.count === 3)).toBe(true)
    const once = resolveInitialState(doc('auto-place line {visited, 0, 0, 0}'), t, [], new Map(), EMPTY, EMPTY)
    expect(once.writes.every((w) => w.kind === 'visited' && w.count === 1)).toBe(true)
  })

  it('filters by a tile predicate guard', () => {
    const tt = buildTiling('truncated-square', 12)
    const res = resolveInitialState(
      doc('auto-place line {[A], 45, 50, 1} if tile-type == octagon'),
      tt,
      [],
      new Map(),
      EMPTY,
      EMPTY,
    )
    expect(res.writes.length).toBeGreaterThan(0)
    expect(res.writes.every((w) => nodeById(tt, w.tile)!.shape === 'octagon')).toBe(true)
  })
})

describe('mergeByTile', () => {
  it('keeps one walker per tile, primary (hand) winning', () => {
    const t = buildTiling('square', 6)
    const auto = resolveInitialState(
      doc('auto-place line {walker, 0, 0, 3}'),
      t,
      ['walker'],
      new Map([['walker', def('move nearest-unvisited')]]),
      EMPTY,
      EMPTY,
    ).seeds
    const hand: Traverser = { ...auto[0], id: 'hand', def: 'Hand', heading: 0 }
    const merged = mergeByTile([hand], auto)
    expect(merged).toHaveLength(6)
    expect(merged.find((m) => m.tile === hand.tile)!.def).toBe('Hand')
  })
})

describe('applyInitWrites', () => {
  it('set-writes overwrite hand-paint on a tile (registry + visited), keeping other fields', () => {
    const base = new Map<string, TileState>([['sq:5,0', { visits: [-1, -1], a: 3, b: 0, c: 0 }]])
    const writes: InitWrite[] = [
      { tile: 'sq:5,0', kind: 'reg', reg: 'a', value: 5 },
      { tile: 'sq:5,0', kind: 'visited', count: 1 },
    ]
    const out = applyInitWrites(base, writes)
    expect(out.get('sq:5,0')).toEqual({ visits: [-1], a: 5, b: 0, c: 0 })
  })
})
