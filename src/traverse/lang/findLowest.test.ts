import { describe, it, expect } from 'vitest'
import { squareTiling, uniqueNeighbors, type Tiling } from '../../tiling'
import { parsePredicate, type Pred } from '../../dsl'
import { findExtreme, maintainFindExtreme, type FindLowestCache, type MatchAt } from './findLowest'

// Ascending "number" order t0..t9, with an O(1) position lookup — the shape src/tiling/numbering supplies.
const order = Array.from({ length: 10 }, (_, i) => `t${i}`)
const posMap = new Map(order.map((id, i) => [id, i]))
const posOf = (id: string) => posMap.get(id) ?? -1
// maintain never touches `tiling` for a 'self'-reach predicate, so a stub is fine for those cases.
const STUB = {} as unknown as Tiling

function pred(text: string): Pred {
  const r = parsePredicate(text)
  if (!r.ok) throw new Error(`bad pred: ${text}`)
  return r.value
}
// Real predicates (so predPathReach classifies them for real); the synthetic matchAt ignores the pred and
// answers from a mutable set, letting each test drive exactly which tiles match, when.
const SELF = pred('visited == 0') // reach 'self'
const NEIGHBOR = pred('[A@e0] == 0') // reach 'neighbor' (one absolute edge hop)
const GLOBAL = pred('[A@e0@e0] == 0') // reach 'global' (multi-hop)
const matchAtOf = (set: ReadonlySet<string>): MatchAt => (_p, id) => set.has(id)

describe('findExtreme — read', () => {
  it('low returns the lowest-numbered match; high the highest', () => {
    const m = new Set(['t3', 't5', 't7'])
    expect(findExtreme(order, 'low', SELF, new Map(), 0, matchAtOf(m))).toBe('t3')
    expect(findExtreme(order, 'high', SELF, new Map(), 0, matchAtOf(m))).toBe('t7')
  })

  it('returns null when nothing matches', () => {
    expect(findExtreme(order, 'low', SELF, new Map(), 0, matchAtOf(new Set()))).toBeNull()
    expect(findExtreme(order, 'high', SELF, new Map(), 0, matchAtOf(new Set()))).toBeNull()
  })

  it('shares one answer across reads at the same step (frozen overlay)', () => {
    const cache: FindLowestCache = new Map()
    const m = new Set(['t4'])
    expect(findExtreme(order, 'low', SELF, cache, 0, matchAtOf(m))).toBe('t4')
    // A second walker reading the same query this tick resumes from the bookmark -> same tile.
    expect(findExtreme(order, 'low', SELF, cache, 0, matchAtOf(m))).toBe('t4')
  })
})

describe('findExtreme — bookmark across ticks', () => {
  it('resumes forward and only nudges back when maintenance reports a lower change', () => {
    const cache: FindLowestCache = new Map()
    const m = new Set(order)
    m.delete('t0')
    m.delete('t1')
    // step 0: lowest match is t2.
    expect(findExtreme(order, 'low', SELF, cache, 0, matchAtOf(m))).toBe('t2')
    // t2 becomes non-matching (it got "visited"); maintenance advances the run to step 1.
    m.delete('t2')
    maintainFindExtreme(STUB, order, posOf, new Set(['t2']), cache, 1, matchAtOf(m))
    expect(findExtreme(order, 'low', SELF, cache, 1, matchAtOf(m))).toBe('t3')
    // t0 becomes matching again, but WITHOUT maintenance being told — the bookmark must NOT rescan below
    // t3, so it still returns t3 (proving it resumes from the bookmark rather than scanning from 0).
    m.add('t0')
    expect(findExtreme(order, 'low', SELF, cache, 1, matchAtOf(m))).toBe('t3')
    // Once maintenance reports t0 changed, the bookmark nudges back to it (the "on change" rule).
    maintainFindExtreme(STUB, order, posOf, new Set(['t0']), cache, 2, matchAtOf(m))
    expect(findExtreme(order, 'low', SELF, cache, 2, matchAtOf(m))).toBe('t0')
  })

  it('a stale step-stamp forces a fresh full scan (out-of-band overlay edit)', () => {
    const cache: FindLowestCache = new Map()
    expect(findExtreme(order, 'low', SELF, cache, 0, matchAtOf(new Set(['t5'])))).toBe('t5')
    // Jump the step without maintaining (as if the user hand-edited while paused): the mismatched stamp
    // makes the read rescan from the start, so it sees a now-lower match.
    expect(findExtreme(order, 'low', SELF, cache, 5, matchAtOf(new Set(['t2', 't5'])))).toBe('t2')
  })
})

describe('maintainFindExtreme — reach-dependent candidate set', () => {
  const tiling = squareTiling(3, 3)
  const ids = tiling.nodes.map((n) => n.id)
  const pos = new Map(ids.map((id, i) => [id, i]))
  const posOfSq = (id: string) => pos.get(id) ?? -1
  const T = ids[4] // a centre tile with neighbours
  const N = uniqueNeighbors(tiling, T)[0]

  it("neighbor reach re-checks a written tile's NEIGHBOURS (so a neighbour's change is caught)", () => {
    const cache: FindLowestCache = new Map()
    const m = new Set<string>()
    expect(findExtreme(ids, 'low', NEIGHBOR, cache, 0, matchAtOf(m))).toBeNull()
    // N becomes matching; the tick wrote T (N's neighbour), not N itself.
    m.add(N)
    maintainFindExtreme(tiling, ids, posOfSq, new Set([T]), cache, 1, matchAtOf(m))
    expect(findExtreme(ids, 'low', NEIGHBOR, cache, 1, matchAtOf(m))).toBe(N)
  })

  it('self reach does NOT expand to neighbours (why the reach classification matters)', () => {
    const cache: FindLowestCache = new Map()
    const m = new Set<string>()
    expect(findExtreme(ids, 'low', SELF, cache, 0, matchAtOf(m))).toBeNull()
    m.add(N)
    maintainFindExtreme(tiling, ids, posOfSq, new Set([T]), cache, 1, matchAtOf(m))
    // Only T was re-checked (not N), so the self-reach bookmark misses N — correct, since a self-reading
    // predicate genuinely can't be flipped by a neighbour's write.
    expect(findExtreme(ids, 'low', SELF, cache, 1, matchAtOf(m))).toBeNull()
  })

  it('global reach rescans (catches a change to a tile that was not written this tick)', () => {
    const cache: FindLowestCache = new Map()
    const m = new Set<string>()
    expect(findExtreme(ids, 'low', GLOBAL, cache, 0, matchAtOf(m))).toBeNull()
    m.add(ids[0]) // a far tile becomes matching; a DIFFERENT tile was written
    maintainFindExtreme(tiling, ids, posOfSq, new Set([ids[8]]), cache, 1, matchAtOf(m))
    expect(findExtreme(ids, 'low', GLOBAL, cache, 1, matchAtOf(m))).toBe(ids[0])
  })
})
