import { describe, it, expect } from 'vitest'
import { squareTiling } from '../../tiling'
import { addVisits, type TileState } from '../../canvas'
import { parseProgram } from './parse'
import { serializeProgram } from './serialize'
import { compileProgram } from './compile'
import { runProgram, type WalkerState } from './exec'
import type { Program } from './types'

const tiling = squareTiling(5, 5)
const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i] as const))
const tileByIndex = tiling.nodes.map((n) => n.id)
const NAMES = new Map<string, string>()

function compile(src: string): Program {
  const r = compileProgram(src, NAMES)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}
function walkerOn(tile: string, prog: Program): WalkerState {
  return { tile, heading: 1, steps: 0, splits: 0, maxSplit: prog.settings.maxSplit, maxSteps: prog.settings.maxSteps, movement: prog.settings.movement, p: 0, q: 0, r: 0 }
}
// A single tick (no numbering supplied -> the search falls back to generation order).
function run(src: string, tile: string, overlay: ReadonlyMap<string, TileState>) {
  const prog = compile(src)
  return runProgram({ tiling, overlay, indexById, tileByIndex, walker: walkerOn(tile, prog), program: prog })
}

describe('find-lowest/highest-tile — parse & serialize', () => {
  it('round-trips both directions', () => {
    for (const src of ['find-lowest-tile visited == 0', 'find-highest-tile [A] == 0']) {
      const r = parseProgram(src)
      expect(r.ok).toBe(true)
      if (r.ok) expect(serializeProgram(r.value)).toBe(src)
    }
  })

  it('shares the fN numbering with find-tile (a later f1 can reference either)', () => {
    const r = parseProgram('find-tile visited == 0 { move nearest-unvisited }\nfind-lowest-tile [A] > 0\nmove f1')
    expect(r.ok).toBe(true)
  })

  it('rejects a dangling fN (find-lowest-tile is f0, so f1 has no block)', () => {
    expect(parseProgram('find-lowest-tile visited == 0\nmove f1').ok).toBe(false)
  })
})

describe('find-lowest/highest-tile — walker-free compile check', () => {
  it('rejects a condition that needs a walker (walker state / relative / target paths)', () => {
    for (const bad of [
      'find-lowest-tile steps > 0',
      'find-highest-tile heading == 0',
      'find-lowest-tile visited@target == 0',
      'find-lowest-tile visited@straight == 0',
    ]) {
      expect(compileProgram(bad, NAMES).ok).toBe(false)
    }
  })

  it('accepts a tile-only or absolute-path condition', () => {
    for (const ok of [
      'find-lowest-tile visited == 0',
      'find-lowest-tile [A@e0] == 0',
      'find-highest-tile tile-type == wedge',
      'find-lowest-tile [visited@e0, visited@e1]:any == 0',
    ]) {
      expect(compileProgram(ok, NAMES).ok).toBe(true)
    }
  })
})

describe('find-lowest/highest-tile — execution', () => {
  const low = tileByIndex[0]
  const high = tileByIndex[tileByIndex.length - 1]
  // Visit every tile EXCEPT the extreme-indexed pair, so exactly two tiles are unvisited.
  const overlay = addVisits(new Map<string, TileState>(), tileByIndex.filter((id) => id !== low && id !== high), 1)

  it('find-lowest-tile visited == 0 then move f0 jumps to the lowest-numbered unvisited tile', () => {
    const res = run('find-lowest-tile visited == 0\nmove f0', 'sq:2,2', overlay)
    expect(res.branches[0]?.tile).toBe(low)
  })

  it('find-highest-tile visited == 0 then move f0 jumps to the highest-numbered unvisited tile', () => {
    const res = run('find-highest-tile visited == 0\nmove f0', 'sq:2,2', overlay)
    expect(res.branches[0]?.tile).toBe(high)
  })

  it('exists@f0 distinguishes a found tile from nothing found', () => {
    const allVisited = addVisits(new Map<string, TileState>(), tileByIndex, 1)
    expect(run('find-lowest-tile visited == 0\nif exists@f0 then increase P', 'sq:2,2', allVisited).next.p).toBe(0)
    expect(run('find-lowest-tile visited == 0\nif exists@f0 then increase P', 'sq:2,2', overlay).next.p).toBe(1)
  })

  it('a found tile with no match makes move f0 a no-op (off-grid base)', () => {
    const allVisited = addVisits(new Map<string, TileState>(), tileByIndex, 1)
    expect(run('find-lowest-tile visited == 0\nmove f0', 'sq:2,2', allVisited).branches).toHaveLength(0)
  })
})
