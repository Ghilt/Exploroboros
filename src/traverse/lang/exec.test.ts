import { describe, it, expect } from 'vitest'
import { squareTiling } from '../../tiling'
import { addVisits, bumpRegistry, type TileState } from '../../canvas'
import { parseProgram } from './parse'
import { runProgram, resolveAbsolutePath, type WalkerState } from './exec'
import type { Program } from './types'
import type { TilePath } from '../../dsl'

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

  it('writes tile registries (bracketed) and walker registries', () => {
    const res = run('put [A] = 5\nincrease P by 3')
    expect(res.tileWrites).toEqual([{ tile: 'sq:2,2', reg: 'a', op: 'set', value: 5 }])
    expect(res.next.p).toBe(3)
  })

  it('put [A, B] writes both tile registries the same value', () => {
    const res = run('put [A, B] = 5')
    expect(res.tileWrites).toEqual([
      { tile: 'sq:2,2', reg: 'a', op: 'set', value: 5 },
      { tile: 'sq:2,2', reg: 'b', op: 'set', value: 5 },
    ])
  })

  it('put [A, B] = [C, visited]:avg — multi-target LHS + reduced RHS (the headline example)', () => {
    // C=3 and one visit → avg = ceil((3 + 1) / 2) = 2, written into both A and B.
    let ov: ReadonlyMap<string, TileState> = addVisits(new Map(), ['sq:2,2'], 0)
    ov = bumpRegistry(ov, 'sq:2,2', 'c', 3)
    const res = run('put [A, B] = [C, visited]:avg', 'sq:2,2', ov)
    expect(res.tileWrites).toEqual([
      { tile: 'sq:2,2', reg: 'a', op: 'set', value: 2 },
      { tile: 'sq:2,2', reg: 'b', op: 'set', value: 2 },
    ])
  })

  it('expands a move range into candidates (each counts against max-split)', () => {
    // facing east on a square: r1=south, r2=west, r3=north — all on-grid from the centre sq:2,2.
    expect(run('max-split = 3\nmove [r1..r3]').branches).toHaveLength(3)
    expect(run('move [r1..r3]').branches).toHaveLength(1) // default max-split = 1 keeps only the first
  })

  it('writes a tile registry on a NEIGHBOUR via a .-path (put [B.straight])', () => {
    // facing east: .straight = the east tile (sq:2,3), .l1 = north (sq:3,2).
    const res = run('put [B.straight] = 7\nincrease [C.l1]')
    expect(res.tileWrites).toEqual([
      { tile: 'sq:2,3', reg: 'b', op: 'set', value: 7 },
      { tile: 'sq:3,2', reg: 'c', op: 'add', value: 1 },
    ])
  })

  it('a write whose .-path runs off the grid is a no-op', () => {
    // sq:2,4 is the east boundary column; facing east, .straight points off-grid -> no write.
    const res = run('put [A.straight] = 1', 'sq:2,4')
    expect(res.tileWrites).toEqual([])
  })

  it('reads a guard against the current tile', () => {
    const visited = addVisits(new Map(), ['sq:2,2'], 0)
    expect(run('if visited > 0 then move straight', 'sq:2,2', visited).branches).toHaveLength(1)
    expect(run('if visited > 0 then move straight').branches).toHaveLength(0)
  })

  it('reads a .-path guard against the tile across an edge', () => {
    // mark the east (straight) tile visited; "visited.straight > 0" should then fire
    const overlay = addVisits(new Map(), ['sq:2,3'], 0)
    expect(run('if visited.straight > 0 then move l1', 'sq:2,2', overlay).branches[0]?.tile).toBe('sq:3,2')
    expect(run('if visited.straight > 0 then move l1').branches).toHaveLength(0)
  })

  it('honours a forbid directive on the destination (.target) over following moves', () => {
    const overlay = addVisits(new Map(), ['sq:2,3'], 0)
    const src = 'directive if visited.target > 0 always forbid move\nmove straight'
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

  it('a .target rule guard filters each candidate of the move', () => {
    // facing east: straight = east (sq:2,3), l1 = north (sq:3,2), r1 = south (sq:1,2).
    const overlay = addVisits(new Map(), ['sq:2,3', 'sq:3,2'], 0)
    const res = run('max-split = 3\nif visited.target > 0 then move [straight, l1, r1]', 'sq:2,2', overlay)
    // straight + l1 land on visited tiles (kept); r1 (south, sq:1,2) is unvisited (dropped).
    expect(res.branches.map((b) => b.tile).sort()).toEqual(['sq:2,3', 'sq:3,2'])
  })

  it('forbid wins when an allow and a forbid directive both match the destination', () => {
    const overlay = addVisits(new Map(), ['sq:2,3'], 0)
    const src = 'directive if visited.target > 0 always allow move\ndirective if visited.target > 0 always forbid move\nmove straight'
    expect(run(src, 'sq:2,2', overlay).branches).toHaveLength(0)
  })

  it('an allow directive never blocks an unguarded move (the reported bug)', () => {
    // The allow guard matches only octagon->wedge, which never holds on a square tiling. It has no
    // gate/forbid to override, so it must be a no-op — every unguarded move still fires. (Old buggy
    // semantics rejected all three because the allow guard was false.)
    const src = 'max-split = 4\ndirective if tile-type == octagon and tile-type.target == wedge always allow move\nmove [l1, r1, straight]'
    expect(run(src).branches.map((b) => b.tile).sort()).toEqual(['sq:1,2', 'sq:2,3', 'sq:3,2'])
  })

  it('an allow directive overrides a false .target move guard (directives overpower own guards)', () => {
    // Own guard (visited.target > 0) is false for the unvisited east tile, but the allow directive
    // matches (east is a square) and forces the move through.
    const src = 'directive if tile-type.target == square always allow move\nif visited.target > 0 then move straight'
    expect(run(src).branches.map((b) => b.tile)).toEqual(['sq:2,3'])
  })

  it('an allow directive overrides a false current-tile move guard too', () => {
    // Non-.target guard (visited > 0) is false on the unvisited current tile — it would normally skip the
    // whole rule up front, but an active allow must still be able to resurrect the move.
    const src = 'directive if tile-type.target == square always allow move\nif visited > 0 then move straight'
    expect(run(src).branches.map((b) => b.tile)).toEqual(['sq:2,3'])
  })

  it('falls back to the move’s own guard when no directive matches', () => {
    // The allow guard is false (no octagons), so it neither blocks nor permits; the own guard (false on
    // the unvisited current tile) then drops the move.
    const src = 'directive if tile-type == octagon always allow move\nif visited > 0 then move straight'
    expect(run(src).branches).toHaveLength(0)
  })

  it('morph keeps registers and switches the definition', () => {
    const res = run('increase P\nmorph spinner straight')
    expect(res.branches[0]).toMatchObject({ tile: 'sq:2,3', morphDef: 'spinner' })
    expect(res.next.p).toBe(1)
  })

  it('resolves a multi-hop .-path (two straights read the tile two east)', () => {
    const overlay = addVisits(new Map(), ['sq:2,4'], 0) // two east of sq:2,2
    expect(run('if visited.straight.straight > 0 then move l1', 'sq:2,2', overlay).branches[0]?.tile).toBe('sq:3,2')
    expect(run('if visited.straight.straight > 0 then move l1').branches).toHaveLength(0)
  })

  it('evaluates each attribute against its OWN path (per-leaf redirection)', () => {
    // facing east: .straight = east (sq:2,3), .l1 = north (sq:3,2), r1 move = south (sq:1,2).
    const eastOnly = addVisits(new Map(), ['sq:2,3'], 0)
    // east visited AND north unvisited -> fire, stepping south
    expect(run('if visited.straight > 0 and visited.l1 == 0 then move r1', 'sq:2,2', eastOnly).branches[0]?.tile).toBe('sq:1,2')
    // if north is ALSO visited the second leaf fails -> no move
    const both = addVisits(eastOnly, ['sq:3,2'], 0)
    expect(run('if visited.straight > 0 and visited.l1 == 0 then move r1', 'sq:2,2', both).branches).toHaveLength(0)
  })

  it('reads and writes a BARE tile registry (put A / if A)', () => {
    expect(run('put A = 5').tileWrites).toEqual([{ tile: 'sq:2,2', reg: 'a', op: 'set', value: 5 }])
    const hasA: ReadonlyMap<string, TileState> = new Map([['sq:2,2', { visits: [], a: 1, b: 0, c: 0 }]])
    expect(run('if A > 0 then increase P', 'sq:2,2', hasA).next.p).toBe(1)
    expect(run('if A > 0 then increase P').next.p).toBe(0) // A defaults to 0 on an unseeded tile
  })

  it('runs an if-block body only when its guard holds', () => {
    const src = 'if visited > 0 {\n  put A = 1\n  move straight\n}'
    const visited = addVisits(new Map(), ['sq:2,2'], 0)
    const ran = run(src, 'sq:2,2', visited)
    expect(ran.tileWrites).toEqual([{ tile: 'sq:2,2', reg: 'a', op: 'set', value: 1 }])
    expect(ran.branches[0]?.tile).toBe('sq:2,3')
    const skipped = run(src) // unvisited -> block skipped
    expect(skipped.tileWrites).toHaveLength(0)
    expect(skipped.branches).toHaveLength(0)
  })

  it('runs a nested if-block', () => {
    const overlay: ReadonlyMap<string, TileState> = new Map([['sq:2,2', { visits: [0], a: 1, b: 0, c: 0 }]])
    const src = 'if visited > 0 {\n  if A > 0 {\n    move straight\n  }\n}'
    expect(run(src, 'sq:2,2', overlay).branches[0]?.tile).toBe('sq:2,3')
    const noA: ReadonlyMap<string, TileState> = new Map([['sq:2,2', { visits: [0], a: 0, b: 0, c: 0 }]])
    expect(run(src, 'sq:2,2', noA).branches).toHaveLength(0) // inner guard false
  })

  it('runs the else branch when the guard is false', () => {
    const src = 'if visited > 0 {\n  put A = 1\n} else {\n  put B = 1\n}'
    const visited = addVisits(new Map(), ['sq:2,2'], 0)
    expect(run(src, 'sq:2,2', visited).tileWrites).toEqual([{ tile: 'sq:2,2', reg: 'a', op: 'set', value: 1 }])
    expect(run(src).tileWrites).toEqual([{ tile: 'sq:2,2', reg: 'b', op: 'set', value: 1 }]) // unvisited -> else
  })

  it('picks the right arm of an if / else-if / else chain', () => {
    const src = 'if A == 1 {\n  move e0\n} else if A == 2 {\n  move e1\n} else {\n  move e2\n}'
    const a = (n: number): ReadonlyMap<string, TileState> => new Map([['sq:2,2', { visits: [], a: n, b: 0, c: 0 }]])
    expect(run(src, 'sq:2,2', a(1)).branches[0]?.tile).toBe('sq:3,2') // e0 = north
    expect(run(src, 'sq:2,2', a(2)).branches[0]?.tile).toBe('sq:2,3') // e1 = east
    expect(run(src, 'sq:2,2', a(9)).branches[0]?.tile).toBe('sq:1,2') // e2 = south (the final else)
  })

  // A tile two east has A=5; the ghost search needs max-split = 4 to fan over all four edges to reach it
  // (default max-split 1 would only follow e0 / north).
  const withA5at = (id: string): ReadonlyMap<string, TileState> => new Map([[id, { visits: [], a: 5, b: 0, c: 0 }]])

  it('find-tile (inline) moves the walker to the located tile', () => {
    const res = run('move find-tile A == 5 {\n  max-split = 4\n  move [e0, e1, e2, e3]\n}', 'sq:2,2', withA5at('sq:2,4'))
    expect(res.branches[0]?.tile).toBe('sq:2,4')
  })

  it('a standalone find-tile stores its result as f0 for a later move', () => {
    const res = run('find-tile A == 5 {\n  max-split = 4\n  move [e0, e1, e2, e3]\n}\nmove f0', 'sq:2,2', withA5at('sq:2,4'))
    expect(res.branches[0]?.tile).toBe('sq:2,4')
  })

  it('a found tile can start a chain (move f0.e0)', () => {
    // f0 = sq:2,4; then e0 (north) -> sq:3,4.
    const res = run('find-tile A == 5 {\n  max-split = 4\n  move [e0, e1, e2, e3]\n}\nmove f0.e0', 'sq:2,2', withA5at('sq:2,4'))
    expect(res.branches[0]?.tile).toBe('sq:3,4')
  })

  it('find-tile that matches nothing makes move fN a no-op', () => {
    const res = run('find-tile A == 5 {\n  max-split = 4\n  move [e0, e1, e2, e3]\n}\nmove f0', 'sq:2,2', new Map())
    expect(res.branches).toHaveLength(0)
  })

  it('find-tile max-split caps the fan-out (default 1 = single path)', () => {
    // A=5 is two EAST of the walker. Default max-split 1 only follows the first edge (e0 = north), so the
    // search walks north and never reaches it -> no move.
    const dflt = run('find-tile A == 5 {\n  move [e0, e1, e2, e3]\n}\nmove f0', 'sq:2,2', withA5at('sq:2,4'))
    expect(dflt.branches).toHaveLength(0)
    // max-split 4 fans over all four edges and reaches it (covered above, asserted here for contrast).
    const wide = run('find-tile A == 5 {\n  max-split = 4\n  move [e0, e1, e2, e3]\n}\nmove f0', 'sq:2,2', withA5at('sq:2,4'))
    expect(wide.branches[0]?.tile).toBe('sq:2,4')
  })

  it('exists.f0 distinguishes "not found" from "found but zero" — a plain read cannot', () => {
    const searchSrc = 'find-tile A == 5 {\n  max-split = 4\n  move [e0, e1, e2, e3]\n}\n'
    // Found (sq:2,4 has A=5, and its `visited` is legitimately 0) — exists is true.
    const found = run(`${searchSrc}if exists.f0 then increase P`, 'sq:2,2', withA5at('sq:2,4'))
    expect(found.next.p).toBe(1)
    expect(run(`${searchSrc}if visited.f0 == 0 then increase Q`, 'sq:2,2', withA5at('sq:2,4')).next.q).toBe(1) // ALSO 0 — ambiguous on its own
    // Not found — exists is false, even though the plain read ALSO comes back 0 (the ambiguity this fixes).
    const missing = run(`${searchSrc}if exists.f0 then increase P`, 'sq:2,2', new Map())
    expect(missing.next.p).toBe(0)
    expect(run(`${searchSrc}if visited.f0 == 0 then increase Q`, 'sq:2,2', new Map()).next.q).toBe(1) // same reading as "found, 0 visits"
  })

  it('exists.e0 tests a plain boundary (no find-tile involved)', () => {
    expect(run('if exists.e0 then increase P', 'sq:2,2').next.p).toBe(1) // has a north neighbour
    // r grows north on a 5x5 grid (rows 0..4) -> row 4 is the north edge, no edge-0 neighbour there
    // (sq:0,0 having no SOUTH neighbour, per the resolveAbsolutePath test below, confirms this framing).
    expect(run('if exists.e0 then increase P', 'sq:4,2').next.p).toBe(0)
  })

  it('a directive reads a CHAIN from .target (absolute + relative-from-walker-heading)', () => {
    // walker on sq:2,2 facing EAST; `move straight` heads to the east neighbour sq:2,3.
    // `.target.e0` = the tile NORTH of that destination = sq:3,3 (absolute, heading-independent).
    const northOfDest = addVisits(new Map<string, TileState>(), ['sq:3,3'], 0)
    expect(run('directive if visited.target.e0 == 1 always forbid move\nmove straight', 'sq:2,2', northOfDest).branches).toHaveLength(0)
    // with nothing visited, nothing is forbidden and the move fires
    expect(run('directive if visited.target.e0 == 1 always forbid move\nmove straight').branches.map((b) => b.tile)).toEqual(['sq:2,3'])
    // `.target.r1`: from the destination, turn right RELATIVE to the WALKER's heading (EAST) -> south ->
    // sq:1,3 (a fixed-0 heading would instead point east, so this pins the heading source).
    const rightOfDest = addVisits(new Map<string, TileState>(), ['sq:1,3'], 0)
    expect(run('directive if visited.target.r1 == 1 always forbid move\nmove straight', 'sq:2,2', rightOfDest).branches).toHaveLength(0)
  })
})

describe('resolveAbsolutePath — walker-free .-paths (the coloring context)', () => {
  const empty = new Map<string, TileState>()
  const idOf = (path: TilePath, start = 'sq:2,2') => resolveAbsolutePath(tiling, empty, start, path)?.id ?? null

  it('resolves an absolute edge hop to the neighbour across that edge (heading-independent)', () => {
    expect(idOf([{ kind: 'edge', index: 0 }])).toBe('sq:3,2') // north
    expect(idOf([{ kind: 'edge', index: 1 }])).toBe('sq:2,3') // east
    expect(idOf([{ kind: 'edge', index: 2 }])).toBe('sq:1,2') // south
    expect(idOf([{ kind: 'edge', index: 3 }])).toBe('sq:2,1') // west
  })

  it('chains absolute edge hops (two norths = two tiles up)', () => {
    expect(idOf([{ kind: 'edge', index: 0 }, { kind: 'edge', index: 0 }])).toBe('sq:4,2')
  })

  it('resolves a .tile N base, alone or leading ABSOLUTE edge hops', () => {
    expect(idOf([{ kind: 'tile', index: 7 }])).toBe(tiling.nodes[7].id)
    const k = tiling.nodes.findIndex((n) => n.id === 'sq:2,2')
    // `.tile k.e0` jumps to sq:2,2 then crosses north -> sq:3,2 (heading-independent, no walker needed)
    expect(idOf([{ kind: 'tile', index: k }, { kind: 'edge', index: 0 }])).toBe('sq:3,2')
    expect(idOf([{ kind: 'tile', index: k }, { kind: 'edge', index: 0 }, { kind: 'edge', index: 0 }])).toBe('sq:4,2')
  })

  it('an empty path is the starting tile', () => {
    expect(idOf([])).toBe('sq:2,2')
  })

  it('returns null at a boundary (the edge points off the grid)', () => {
    expect(resolveAbsolutePath(tiling, empty, 'sq:0,0', [{ kind: 'edge', index: 2 }])).toBeNull() // no south
  })

  it('returns null for any walker-dependent segment (needs a heading/destination)', () => {
    expect(idOf([{ kind: 'straight' }])).toBeNull()
    expect(idOf([{ kind: 'turn', dir: 'r', n: 1 }])).toBeNull()
    expect(idOf([{ kind: 'unvisited' }])).toBeNull()
    expect(idOf([{ kind: 'target' }])).toBeNull()
    // a `found` ref needs the traverser's per-tick search — nothing to resolve in a coloring context
    expect(idOf([{ kind: 'found', index: 0 }])).toBeNull()
    // a relative seg ANYWHERE in the chain disqualifies the whole path
    expect(idOf([{ kind: 'edge', index: 0 }, { kind: 'straight' }])).toBeNull()
    // a `.tile N` base can lead only ABSOLUTE edge hops walker-free; a relative hop after it needs a walker
    expect(idOf([{ kind: 'tile', index: 7 }, { kind: 'straight' }])).toBeNull()
    expect(idOf([{ kind: 'tile', index: 7 }, { kind: 'turn', dir: 'r', n: 1 }])).toBeNull()
  })
})
