import { describe, it, expect } from 'vitest'
import { buildTiling, addVisits, type TileState } from '../canvas'
import { numberingFor } from '../tiling'
import { parseProgram, stepTraversers, stepTraversersInto, type FindLowestCache, type Program, type Traverser } from './index'

// A find-lowest-tile program is the sharpest cross-path test: the immutable live tick (stepTraversers)
// and the in-place export tick (stepTraversersInto) must produce the IDENTICAL run, since both share
// computeTick AND both must maintain the bookmark cache the same way (the one correctness coupling
// between them). Each tick the walker jumps to the globally-lowest unvisited tile.
const tiling = buildTiling('square', 4)
const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i] as const))
const numbering = numberingFor(tiling, 'left-to-right')

const FL: Program = (() => {
  const r = parseProgram('find-lowest-tile visited == 0\nmove f0')
  if (!r.ok) throw new Error(r.error.message)
  return r.value
})()
const defs = new Map([['fl', FL]])
const seedTile = tiling.nodes[5].id
const seed = (): Traverser => ({ id: 's', tile: seedTile, heading: 0, def: 'fl', steps: 0, splits: 0, maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 })

const visitedSet = (ov: ReadonlyMap<string, TileState>) =>
  new Set([...ov].filter(([, st]) => st.visits.length > 0).map(([id]) => id))

describe('find-lowest run — live and export agree', () => {
  it('produces the identical visited set across the immutable + in-place tick paths', () => {
    const TICKS = 8
    // Live: immutable stepTraversers, threading its own cache each tick.
    const liveCache: FindLowestCache = new Map()
    let liveOverlay: ReadonlyMap<string, TileState> = addVisits(new Map<string, TileState>(), [seedTile], 0)
    let liveWalkers: ReadonlyArray<Traverser> = [seed()]
    let liveStep = 0
    for (let i = 0; i < TICKS; i += 1) {
      const res = stepTraversers({ tiling, overlay: liveOverlay, traversers: liveWalkers, step: liveStep, defs, indexById, numbering, findLowestCache: liveCache })
      liveOverlay = res.overlay
      liveWalkers = res.traversers
      liveStep = res.step
    }

    // Export: in-place stepTraversersInto, its own cache.
    const expCache: FindLowestCache = new Map()
    const expOverlay = addVisits(new Map<string, TileState>(), [seedTile], 0)
    let expWalkers: ReadonlyArray<Traverser> = [seed()]
    let expStep = 0
    for (let i = 0; i < TICKS; i += 1) {
      const res = stepTraversersInto({ tiling, overlay: expOverlay, traversers: expWalkers, step: expStep, defs, indexById, numbering, findLowestCache: expCache }, expOverlay)
      expWalkers = res.traversers
      expStep = res.step
    }

    const live = visitedSet(liveOverlay)
    expect(live.size).toBeGreaterThan(1) // it actually grew (find-lowest kept finding fresh tiles)
    expect(live).toEqual(visitedSet(expOverlay))
  })
})

describe('tile-number in a walker guard follows the numbering scheme', () => {
  const guardProg: Program = (() => {
    const r = parseProgram('if tile-number == 0 then put A = 1\nmove nearest-unvisited')
    if (!r.ok) throw new Error(r.error.message)
    return r.value
  })()
  const gdefs = new Map([['t', guardProg]])
  const centre = numberingFor(tiling, 'spiral').order[0] // spiral number 0 = the centremost tile
  const walkerAt = (t: string): Traverser => ({ id: 'w', tile: t, heading: 0, def: 't', steps: 0, splits: 0, maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 })
  // Run one tick with a walker sitting on the centre; return the A written on the centre (1 iff the
  // `tile-number == 0` guard fired). The centre is number 0 ONLY under spiral, so the verdict flips by scheme.
  const centreA = (scheme: 'left-to-right' | 'spiral') => {
    const num = numberingFor(tiling, scheme)
    const idx = new Map<string, number>()
    num.order.forEach((id, i) => idx.set(id, i))
    const res = stepTraversers({ tiling, overlay: new Map(), traversers: [walkerAt(centre)], step: 0, defs: gdefs, indexById: idx, numbering: num })
    return res.overlay.get(centre)?.a ?? 0
  }

  it('same tile, opposite verdict under normal vs spiral', () => {
    expect(centre).not.toBe(tiling.nodes[0].id) // spiral-0 (centre) is not generation-0 (a corner)
    expect(centreA('spiral')).toBe(1) // centre IS spiral number 0 → guard fires
    expect(centreA('left-to-right')).toBe(0) // centre is NOT left-to-right number 0 (top-left is) → skipped
  })
})
