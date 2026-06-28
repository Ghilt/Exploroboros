import { describe, it, expect } from 'vitest'
import { buildTiling, addVisits, applyPaint, type TileState } from '../canvas'
import { stepTraversers, parseProgram, DEFAULT_SETTINGS, type Program, type Traverser } from '../traverse'
import { runToCompletion } from './runToCompletion'

const WALKER: Program = (() => {
  const r = parseProgram('move nearest-unvisited')
  if (!r.ok) throw new Error(r.error.message)
  return r.value
})()
const defs = new Map([['Walker', WALKER]])

const tiling = buildTiling('square', 4)
const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i] as const))

function seed(tile: string): Traverser {
  return { id: 'w', tile, heading: 0, def: 'Walker', steps: 0, splits: 0, maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 }
}

// The immutable reference: loop stepTraversers exactly as Workspace.play() would (refresh settings,
// stamp the start tile at step 0), so we can assert the in-place runToCompletion matches it.
function referenceRun(seeds: Traverser[], base: ReadonlyMap<string, TileState>) {
  const live = seeds.map((s) => {
    const set = defs.get(s.def)?.settings ?? DEFAULT_SETTINGS
    return { ...s, steps: 0, splits: 0, p: 0, q: 0, r: 0, maxSplit: set.maxSplit, maxSteps: set.maxSteps, movement: set.movement }
  })
  let overlay: ReadonlyMap<string, TileState> = live.length ? addVisits(base, live.map((t) => t.tile), 0) : new Map(base)
  let walkers = live
  let step = 0
  let ticks = 0
  while (walkers.length > 0 && ticks < 1_000_000) {
    const r = stepTraversers({ tiling, overlay, traversers: walkers, step, defs, indexById })
    overlay = r.overlay
    walkers = r.traversers
    step = r.step
    ticks += 1
  }
  return { overlay, ticks }
}

function normalize(overlay: ReadonlyMap<string, TileState>) {
  return [...overlay.entries()]
    .map(([id, s]) => [id, [...s.visits], s.a, s.b, s.c] as const)
    .sort((x, y) => (x[0] < y[0] ? -1 : 1))
}

describe('runToCompletion', () => {
  it('matches the immutable stepTraversers loop step-for-step (same final overlay + ticks)', () => {
    const start = tiling.nodes[0].id
    const ref = referenceRun([seed(start)], new Map())
    const got = runToCompletion(tiling, [seed(start)], new Map(), defs, indexById)
    expect(got.ticks).toBe(ref.ticks)
    expect(normalize(got.overlay)).toEqual(normalize(ref.overlay))
    expect(got.hitCap).toBe(false)
  })

  it('the run actually terminates and visits more than just the start tile', () => {
    const got = runToCompletion(tiling, [seed(tiling.nodes[0].id)], new Map(), defs, indexById)
    expect(got.hitCap).toBe(false)
    const visited = [...got.overlay.values()].filter((s) => s.visits.length > 0).length
    expect(visited).toBeGreaterThan(1)
  })

  it('handles an empty run (no seeds): returns the hand-painted base unchanged, zero ticks', () => {
    const base = applyPaint(new Map<string, TileState>(), [tiling.nodes[0].id], 'a')
    const got = runToCompletion(tiling, [], base, defs, indexById)
    expect(got.ticks).toBe(0)
    expect(got.hitCap).toBe(false)
    expect(normalize(got.overlay)).toEqual(normalize(base))
  })

  it('does not mutate the caller-provided base overlay', () => {
    const base = applyPaint(new Map<string, TileState>(), [tiling.nodes[5].id], 'visited')
    const before = normalize(base)
    runToCompletion(tiling, [seed(tiling.nodes[0].id)], base, defs, indexById)
    expect(normalize(base)).toEqual(before)
  })

  it('stops at the safety cap for a low maxTicks and reports hitCap', () => {
    const got = runToCompletion(tiling, [seed(tiling.nodes[0].id)], new Map(), defs, indexById, 1)
    expect(got.ticks).toBe(1)
    expect(got.hitCap).toBe(true)
  })
})
