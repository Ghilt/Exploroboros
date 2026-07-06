import { describe, it, expect } from 'vitest'
import { squareTiling } from '../tiling'
import { addVisits, type TileState } from '../canvas'
import { parseProgram, type Program } from './lang'
import { stepTraversers, stepTraversersTraced } from './step'
import type { Traverser, TraverseState } from './types'
import type { StmtTrace } from './trace'

// Same square-grid harness as exec.test.ts, but driving the full tick (stepTraversersTraced) so the
// trace + coalesce/drop are exercised end to end. sq:r,c — r grows north, c grows east. heading is an
// EDGE NUMBER (0 = north, clockwise); edge 1 = east, so aiming east keeps straight/l1/r1 = east/north/south.
const tiling = squareTiling(5, 5)
const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i] as const))
const EAST = 1

function compile(src: string): Program {
  const r = parseProgram(src)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

function walker(id: string, tile: string, def: string, prog: Program, over: Partial<Traverser> = {}): Traverser {
  return {
    id,
    tile,
    heading: EAST,
    def,
    steps: 0,
    splits: 0,
    maxSplit: prog.settings.maxSplit,
    maxSteps: prog.settings.maxSteps,
    movement: prog.settings.movement,
    p: 0,
    q: 0,
    r: 0,
    ...over,
  }
}

function state(
  src: string,
  tile = 'sq:2,2',
  overlay: ReadonlyMap<string, TileState> = new Map(),
  over: Partial<Traverser> = {},
): TraverseState {
  const prog = compile(src)
  return { tiling, overlay, traversers: [walker('tr1', tile, 'W', prog, over)], step: 0, defs: new Map([['W', prog]]), indexById }
}

// The single walker's statement traces (the common path in these tests).
function stmts(s: TraverseState): StmtTrace[] {
  return stepTraversersTraced(s).trace.traversers[0].statements
}

// Stable, comparable snapshot of an overlay (Map order isn't guaranteed across the two calls).
function dump(overlay: ReadonlyMap<string, TileState>) {
  return [...overlay.entries()].map(([id, st]) => [id, st] as const).sort((a, b) => a[0].localeCompare(b[0]))
}

describe('tick trace', () => {
  it('is zero-effect: traced and untraced ticks produce identical traversers + overlay', () => {
    for (const src of ['move straight', 'max-split = 2\nmove [l1, r1]', 'put [A] = 5\nincrease P by 3\nmove straight']) {
      const plain = stepTraversers(state(src))
      const traced = stepTraversersTraced(state(src))
      expect(traced.traversers).toEqual(plain.traversers)
      expect(traced.step).toBe(plain.step)
      expect(dump(traced.overlay)).toEqual(dump(plain.overlay))
    }
  })

  it('records a forbid directive blocking a move (the destination is visited)', () => {
    const overlay = addVisits(new Map(), ['sq:2,3'], 0) // east (the straight destination) visited
    const ss = stmts(state('directive if visited@target > 0 always forbid move\nmove straight', 'sq:2,2', overlay))
    const move = ss.find((s) => s.kind === 'move')
    expect(move?.kind === 'move' && move.candidates).toHaveLength(1)
    if (move?.kind !== 'move') throw new Error('expected a move statement')
    const c = move.candidates[0]
    expect(c.survived).toBe(false)
    expect(c.dest).toBe('sq:2,3')
    expect(c.reject).toEqual({ by: 'directive', index: 0, allow: false, guard: expect.objectContaining({ result: true }) })
  })

  it('records per-candidate @target rejects on a split', () => {
    const overlay = addVisits(new Map(), ['sq:2,3', 'sq:3,2'], 0) // east + north visited; south not
    const ss = stmts(state('max-split = 3\nif visited@target > 0 then move [straight, l1, r1]', 'sq:2,2', overlay))
    const move = ss.find((s) => s.kind === 'move')
    if (move?.kind !== 'move') throw new Error('expected a move statement')
    const byDest = Object.fromEntries(move.candidates.map((c) => [c.dest, c]))
    expect(byDest['sq:2,3'].survived).toBe(true) // east, visited
    expect(byDest['sq:3,2'].survived).toBe(true) // north, visited
    expect(byDest['sq:1,2'].survived).toBe(false) // south, unvisited
    expect(byDest['sq:1,2'].reject?.by).toBe('own-guard')
  })

  it('a gate-skip reports the guard it failed and the tiles it read (the motivating case)', () => {
    // `visited@straight` reads the east neighbour (unvisited) — guard false -> whole statement skipped,
    // the move never attempted. Mirrors `tile-type@e0 == wedge` reading an octagon.
    const ss = stmts(state('if visited@straight > 0 then move straight'))
    expect(ss).toHaveLength(1)
    const g = ss[0]
    expect(g.kind).toBe('gate-skip')
    if (g.kind !== 'gate-skip') throw new Error('expected gate-skip')
    expect(g.guard.result).toBe(false)
    // the guard read the straight (east) neighbour via its @-path
    expect(g.guard.readTiles).toEqual([{ id: 'sq:2,3', role: 'read', tileType: 'square', text: '@straight' }])
  })

  it('a multi-hop chain records the chain text and the FINAL destination only', () => {
    const traced = stepTraversersTraced(state('move straight@straight'))
    const move = traced.trace.traversers[0].statements.find((s) => s.kind === 'move')
    if (move?.kind !== 'move') throw new Error('expected a move statement')
    expect(move.candidates[0].chainText).toBe('straight@straight')
    expect(move.candidates[0].dest).toBe('sq:2,4') // two east hops
    expect(traced.traversers[0].tile).toBe('sq:2,4')
  })

  it('records writes (put / increase) as statement traces', () => {
    const ss = stmts(state('put A = 5\nincrease P by 3'))
    expect(ss.map((s) => s.kind)).toEqual(['write', 'write'])
    expect(ss.map((s) => s.source)).toEqual(['put A = 5', 'increase P by 3'])
  })

  it('coalesces two identical branches and reports the merge', () => {
    const prog = compile('move straight')
    const s: TraverseState = {
      tiling,
      overlay: new Map(),
      traversers: [walker('tr1', 'sq:2,2', 'W', prog), walker('tr2', 'sq:2,2', 'W', prog)],
      step: 0,
      defs: new Map([['W', prog]]),
      indexById,
    }
    const traced = stepTraversersTraced(s)
    expect(traced.traversers).toHaveLength(1) // both landed on sq:2,3 facing east -> merged
    expect(traced.trace.coalesced).toEqual([{ key: expect.any(String), survivorId: 'tr1', mergedId: 'tr2' }])
  })

  it('drops an over-age branch and reports it', () => {
    const traced = stepTraversersTraced(state('move straight', 'sq:2,2', new Map(), { steps: 1, maxSteps: 1 }))
    expect(traced.traversers).toHaveLength(0) // steps -> 2 > maxSteps 1
    expect(traced.trace.dropped).toEqual([{ id: 'tr1', steps: 2, maxSteps: 1 }])
  })

  it('traces a walker with an unknown definition as missingDef', () => {
    const prog = compile('move straight')
    const s: TraverseState = {
      tiling,
      overlay: new Map(),
      traversers: [walker('tr1', 'sq:2,2', 'Ghost', prog)], // 'Ghost' not in defs
      step: 0,
      defs: new Map([['W', prog]]),
      indexById,
    }
    const traced = stepTraversersTraced(s)
    expect(traced.traversers).toHaveLength(0)
    expect(traced.trace.traversers[0]).toMatchObject({ id: 'tr1', def: 'Ghost', missingDef: true, statements: [], branches: [] })
  })

  it('records the destinations visited this tick', () => {
    const traced = stepTraversersTraced(state('max-split = 2\nmove [l1, r1]'))
    expect(traced.trace.step).toBe(0)
    expect(traced.trace.nextStep).toBe(1)
    expect([...traced.trace.destinations].sort()).toEqual(['sq:1,2', 'sq:3,2'])
  })
})
