// Computed (parenthesized-expression) edge/turn/tile/find references — `r(steps % 2)`, `e(orientation)`,
// `f([A, B]:max)`, `t(steps + 1)` — plus the `tN` shorthand for `tile N` and `r0`/`l0` == `straight`.
import { describe, it, expect } from 'vitest'
import { squareTiling } from '../../tiling'
import { bumpRegistry, type TileState } from '../../canvas'
import { parsePredicate, parsePathFragment, serialize, serializePath } from '../../dsl'
import { parseProgram } from './parse'
import { serializeProgram } from './serialize'
import { runProgram, type WalkerState } from './exec'
import type { Program } from './types'

const tiling = squareTiling(5, 5)
const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i] as const))
const tileByIndex = tiling.nodes.map((n) => n.id)
// heading is an EDGE NUMBER (0 = north, clockwise): aiming east, `straight` -> east, l1 -> north (y-up),
// r1 -> south, r2/l2 -> west. (Matches exec.test.ts's frame.)
const EAST = 1

function compile(src: string): Program {
  const r = parseProgram(src)
  if (!r.ok) throw new Error(`parse failed: ${r.error.message}`)
  return r.value
}
function walkerOn(tile: string, prog: Program, steps = 0): WalkerState {
  return { tile, heading: EAST, steps, splits: 0, maxSplit: prog.settings.maxSplit, maxSteps: prog.settings.maxSteps, movement: prog.settings.movement, p: 0, q: 0, r: 0 }
}
function run(src: string, opts: { tile?: string; overlay?: ReadonlyMap<string, TileState>; steps?: number } = {}) {
  const prog = compile(src)
  return runProgram({ tiling, overlay: opts.overlay ?? new Map(), indexById, tileByIndex, walker: walkerOn(opts.tile ?? 'sq:2,2', prog, opts.steps), program: prog })
}

describe('computed refs — parse + serialize round-trip', () => {
  const roundTrip = (src: string) => serializeProgram(compile(src))
  it('keeps a computed traverser ref stable through parse ∘ serialize', () => {
    for (const src of [
      'move r(steps % 2)',
      'move e(orientation + orientation.e2)',
      'move l(A + B.e0)',
      'move f([A, B, visited.r2.r2]:max)',
      'move t5',
      'move t(steps)',
      'move t5.e0',
      'if visited.e(orientation) > 0 then move straight',
      'if visited.t(steps + 1) == 0 then move straight',
      'move e(orientation).r(steps)',
      // write targets (canonical: a single target is bare, several are bracketed) with computed amounts
      'put B.t(steps + 1) = 1',
      'put [A, B.e(orientation)] = 1',
      'put B.e([A, B]:max) = 1',
    ]) {
      expect(roundTrip(src)).toBe(src)
    }
  })

  it('r0 / l0 parse and are kept (they resolve to straight)', () => {
    expect(roundTrip('move r0')).toBe('move r0')
    expect(roundTrip('move l0')).toBe('move l0')
  })

  it('renders tile addressing as `tN`, accepting the legacy `tile N` on input', () => {
    // dsl path + predicate: `.tile N` (legacy) re-serializes to `.tN`; `t(expr)` is a tile-identity term.
    expect(serialize(parseOk('visited.t5 == 0'))).toBe('visited.t5 == 0')
    expect(serialize(parseOk('visited.tile 5 == 0'))).toBe('visited.t5 == 0')
    expect(serialize(parseOk('t(steps + 1) == straight'))).toBe('t(steps + 1) == straight')
    expect(serialize(parseOk('t5 == straight'))).toBe('t5 == straight')
    // a standalone path fragment (what the preview scanner re-parses)
    expect(pathText('.e(orientation)')).toBe('.e(orientation)')
    expect(pathText('.tile 5.e0')).toBe('.t5.e0')
  })
})

function parseOk(src: string) {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}
function pathText(src: string) {
  const r = parsePathFragment(src)
  if (!r.ok) throw new Error(r.error.message)
  return serializePath(r.value)
}

describe('computed refs — engine resolution', () => {
  it('`move r(steps % 2)` alternates straight / right by step', () => {
    // steps 0 -> r0 -> straight -> east neighbour; steps 1 -> r1 -> south.
    expect(run('move r(steps % 2)', { steps: 0 }).branches[0]?.tile).toBe('sq:2,3')
    expect(run('move r(steps % 2)', { steps: 1 }).branches[0]?.tile).toBe('sq:1,2')
  })

  it('`move e(orientation)` hits the computed absolute edge', () => {
    // square orientation = 0 -> e0 -> north (y-up) -> sq:3,2.
    expect(run('move e(orientation)').branches[0]?.tile).toBe('sq:3,2')
  })

  it('reads a registry inside the amount', () => {
    // A = 1 on the current tile -> r(A) -> r1 -> south.
    const overlay = bumpRegistry(new Map(), 'sq:2,2', 'a', 1)
    expect(run('move r(A)', { overlay }).branches[0]?.tile).toBe('sq:1,2')
  })

  it('`f(0)` resolves the same tile as `f0`', () => {
    const prog = 'find-tile visited == 0 {\n  move straight\n}\n'
    expect(run(prog + 'move f0').branches[0]?.tile).toBe(run(prog + 'move f(0)').branches[0]?.tile)
    expect(run(prog + 'move f0').branches[0]?.tile).toBe('sq:2,3')
  })

  it('a computed out-of-range `f` index makes no move', () => {
    expect(run('find-tile visited == 0 {\n  move straight\n}\nmove f(5)').branches).toHaveLength(0)
  })

  it('`move tN` / `move t(expr)` jumps to the absolute tile by board number', () => {
    // tile #5 in generation order (no numbering scheme passed) is tileByIndex[5].
    const target = tileByIndex[5]
    expect(run('move t5').branches[0]?.tile).toBe(target)
    expect(run('move t(2 + 3)').branches[0]?.tile).toBe(target)
    expect(run('move t(steps)', { steps: 5 }).branches[0]?.tile).toBe(target)
    // out of range -> no move
    expect(run('move t(9999)').branches).toHaveLength(0)
  })

  it('`.t(expr)` addresses a tile by a computed number', () => {
    // sq:0,0 is generation index 0; steps 0 -> t(0) -> tile #0 -> move there is 1 hop away? no: it's a JUMP
    // base. Read its type through the path instead: visited.t0 reads tile index 0 (unvisited -> 0), and a
    // guard using it compiles + runs without error.
    const res = run('if visited.t(steps) == 0 then move straight', { steps: 0 })
    expect(res.branches[0]?.tile).toBe('sq:2,3')
  })
})

describe('computed refs — rejected forms', () => {
  it('a range over a computed amount is a parse error (ranges need literal ends)', () => {
    const r = parseProgram('move [e(orientation)..e3]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/literal numbers/)
  })

  it('a fractional result rounds to the nearest whole edge', () => {
    // steps 3 -> 3/2 = 1.5 -> round -> 2 -> r2 -> west (sq:2,1).
    expect(run('move r(steps / 2)', { steps: 3 }).branches[0]?.tile).toBe('sq:2,1')
  })
})
