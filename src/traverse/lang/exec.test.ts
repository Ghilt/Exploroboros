import { describe, it, expect } from 'vitest'
import { squareTiling } from '../../tiling'
import { addVisits, type TileState } from '../../canvas'
import { parseProgram } from './parse'
import { runProgram, type WalkerState } from './exec'
import type { Program } from './types'

const tiling = squareTiling(5, 5)
const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i] as const))
const tileByIndex = tiling.nodes.map((n) => n.id)
// heading is an EDGE NUMBER (0 = north, clockwise): on a square, edge 1 = east. Aiming east keeps
// `straight` -> the east neighbour, l1 -> north, r1 -> south — the frame these cases were written in.
const EAST = 1

function compile(src: string): Program {
  const r = parseProgram(src)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

function walkerOn(tile: string, prog: Program): WalkerState {
  return {
    tile,
    heading: EAST,
    steps: 0,
    splits: 0,
    maxSplit: prog.settings.maxSplit,
    maxSteps: prog.settings.maxSteps,
    movement: prog.settings.movement,
    p: 0,
    q: 0,
    r: 0,
  }
}

function run(src: string, tile = 'sq:2,2', overlay: ReadonlyMap<string, TileState> = new Map()) {
  const prog = compile(src)
  return runProgram({ tiling, overlay, indexById, tileByIndex, walker: walkerOn(tile, prog), program: prog })
}

describe('traverser program execution', () => {
  it('moves straight to the east neighbour', () => {
    const res = run('move straight')
    expect(res.branches).toHaveLength(1)
    expect(res.branches[0]).toMatchObject({ tile: 'sq:2,3', morphDef: undefined })
    expect(res.branches[0].heading).toBeCloseTo(EAST)
  })

  it('splits when max-split allows, and is capped otherwise', () => {
    expect(run('max-split = 2\nmove [l1, r1]').branches.map((b) => b.tile)).toEqual(['sq:3,2', 'sq:1,2'])
    // default max-split = 1 keeps only the first chain
    expect(run('move [l1, r1]').branches.map((b) => b.tile)).toEqual(['sq:3,2'])
  })

  it('drops to no branch when no move fires (only registry writes)', () => {
    const res = run('increase P')
    expect(res.branches).toHaveLength(0)
    expect(res.next.p).toBe(1)
  })

  it('writes tile registries and traverser registries', () => {
    const res = run('put A = 5\nincrease P by 3')
    expect(res.tileWrites).toEqual([{ tile: 'sq:2,2', reg: 'a', op: 'set', value: 5 }])
    expect(res.next.p).toBe(3)
  })

  it('reads a guard against the current tile', () => {
    const visited = addVisits(new Map(), ['sq:2,2'], 0)
    expect(run('if visited > 0 then move straight', 'sq:2,2', visited).branches).toHaveLength(1)
    expect(run('if visited > 0 then move straight').branches).toHaveLength(0)
  })

  it('reads an @-path guard against the tile across an edge', () => {
    // mark the east (straight) tile visited; "visited@straight > 0" should then fire
    const overlay = addVisits(new Map(), ['sq:2,3'], 0)
    expect(run('if visited@straight > 0 then move l1', 'sq:2,2', overlay).branches[0]?.tile).toBe('sq:3,2')
    expect(run('if visited@straight > 0 then move l1').branches).toHaveLength(0)
  })

  it('honours a forbid directive on the destination (@target) over following moves', () => {
    const overlay = addVisits(new Map(), ['sq:2,3'], 0)
    const src = 'directive if visited@target > 0 always forbid move\nmove straight'
    expect(run(src, 'sq:2,2', overlay).branches).toHaveLength(0) // east (destination) visited -> forbidden
    expect(run(src).branches).toHaveLength(1) // east unvisited -> allowed
  })

  it('a path-less directive tests the CURRENT tile, not the destination', () => {
    // Only the current tile is visited; the destination (east) is not.
    const here = addVisits(new Map(), ['sq:2,2'], 0)
    const src = 'directive if visited > 0 always forbid move\nmove straight'
    expect(run(src, 'sq:2,2', here).branches).toHaveLength(0) // standing on a visited tile -> all moves forbidden
    expect(run(src).branches).toHaveLength(1) // current tile unvisited -> move allowed regardless of the destination
  })

  it('a @target rule guard filters each candidate of the move', () => {
    // facing east: straight = east (sq:2,3), l1 = north (sq:3,2), r1 = south (sq:1,2).
    const overlay = addVisits(new Map(), ['sq:2,3', 'sq:3,2'], 0)
    const res = run('max-split = 3\nif visited@target > 0 then move [straight, l1, r1]', 'sq:2,2', overlay)
    // straight + l1 land on visited tiles (kept); r1 (south, sq:1,2) is unvisited (dropped).
    expect(res.branches.map((b) => b.tile).sort()).toEqual(['sq:2,3', 'sq:3,2'])
  })

  it('forbid wins when an allow and a forbid directive both match the destination', () => {
    const overlay = addVisits(new Map(), ['sq:2,3'], 0)
    const src = 'directive if visited@target > 0 always allow move\ndirective if visited@target > 0 always forbid move\nmove straight'
    expect(run(src, 'sq:2,2', overlay).branches).toHaveLength(0)
  })

  it('morph keeps registers and switches the definition', () => {
    const res = run('increase P\nmorph spinner straight')
    expect(res.branches[0]).toMatchObject({ tile: 'sq:2,3', morphDef: 'spinner' })
    expect(res.next.p).toBe(1)
  })

  it('resolves a multi-hop @-path (two straights read the tile two east)', () => {
    const overlay = addVisits(new Map(), ['sq:2,4'], 0) // two east of sq:2,2
    expect(run('if visited@straight@straight > 0 then move l1', 'sq:2,2', overlay).branches[0]?.tile).toBe('sq:3,2')
    expect(run('if visited@straight@straight > 0 then move l1').branches).toHaveLength(0)
  })

  it('evaluates each attribute against its OWN path (per-leaf redirection)', () => {
    // facing east: @straight = east (sq:2,3), @l1 = north (sq:3,2), r1 move = south (sq:1,2).
    const eastOnly = addVisits(new Map(), ['sq:2,3'], 0)
    // east visited AND north unvisited -> fire, stepping south
    expect(run('if visited@straight > 0 and visited@l1 == 0 then move r1', 'sq:2,2', eastOnly).branches[0]?.tile).toBe('sq:1,2')
    // if north is ALSO visited the second leaf fails -> no move
    const both = addVisits(eastOnly, ['sq:3,2'], 0)
    expect(run('if visited@straight > 0 and visited@l1 == 0 then move r1', 'sq:2,2', both).branches).toHaveLength(0)
  })
})
