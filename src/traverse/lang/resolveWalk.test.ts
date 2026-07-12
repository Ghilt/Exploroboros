import { describe, it, expect } from 'vitest'
import { squareTiling } from '../../tiling'
import { addVisits, type TileState } from '../../canvas'
import { resolveWalk, computeFound } from './resolveWalk'
import { compileProgram } from './compile'
import type { EdgeRef } from './types'
import type { OccurrenceBase, PathOccurrence } from './scanPaths'

// Same square frame as edges.test.ts: tile (r,c) id `sq:r,c`, edge 0 = north, 1 = east, 2 = south, 3 = west.
const tiling = squareTiling(5, 5)
const empty: ReadonlyMap<string, TileState> = new Map()
const NORTH = 0

// A minimal occurrence — resolveWalk only reads base + refs (span/line/text are for the UI layer).
const occ = (base: OccurrenceBase, refs: EdgeRef[]): PathOccurrence => ({ base, refs, span: { start: 0, end: 0 }, line: 0, text: '' })
const current = (refs: EdgeRef[]) => occ({ kind: 'current' }, refs)

describe('resolveWalk', () => {
  it('walks a single straight from the current tile', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', current([{ kind: 'straight' }]))).toEqual(['sq:2,2', 'sq:3,2'])
  })

  it('includes the intermediate tile over two hops', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', current([{ kind: 'straight' }, { kind: 'straight' }]))).toEqual([
      'sq:2,2',
      'sq:3,2',
      'sq:4,2',
    ])
  })

  it('re-aims after a turn', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', current([{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'straight' }]))).toEqual([
      'sq:2,2',
      'sq:2,3',
      'sq:2,4',
    ])
  })

  it('honours absolute movement', () => {
    // Facing east but absolute: straight is north.
    expect(resolveWalk(tiling, empty, 'sq:2,2', 1, 'absolute', current([{ kind: 'straight' }]))).toEqual(['sq:2,2', 'sq:3,2'])
  })

  it('truncates at a boundary mid-walk', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,3', 1, 'relative', current([{ kind: 'straight' }, { kind: 'straight' }]))).toEqual(['sq:2,3', 'sq:2,4'])
  })

  it('resolves nearest-unvisited against the overlay', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', current([{ kind: 'unvisited' }]))).toEqual(['sq:2,2', 'sq:3,2'])
    const overlay = addVisits(empty, ['sq:3,2'], 0)
    // North visited; east (1) and west (3) tie -> lower edge (east) wins.
    expect(resolveWalk(tiling, overlay, 'sq:2,2', NORTH, 'relative', current([{ kind: 'unvisited' }]))).toEqual(['sq:2,2', 'sq:2,3'])
  })

  it('a .tile N base resolves via the numbering order when given', () => {
    const order = tiling.nodes.map((n) => n.id)
    const id3 = order[3]
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', occ({ kind: 'tile', index: 3 }, []), order)).toEqual([id3])
  })

  it('a .tile N base falls back to generation order without an order array', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', occ({ kind: 'tile', index: 3 }, []))).toEqual([tiling.nodes[3].id])
  })

  it('an out-of-range .tile N base yields nothing', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', occ({ kind: 'tile', index: 99999 }, []))).toEqual([])
  })

  it('a target base is not statically resolvable', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', occ({ kind: 'target' }, []))).toEqual([])
  })

  it('a found base yields nothing without a found array', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', occ({ kind: 'found', index: 0 }, []))).toEqual([])
  })

  it('a found base resolves via the found array (fN), starting at the found tile', () => {
    const found = [{ tile: 'sq:2,2', heading: NORTH }] // pretend a find-tile landed on sq:2,2 facing north
    // `move f0` -> just the found tile.
    expect(resolveWalk(tiling, empty, 'sq:0,0', NORTH, 'relative', occ({ kind: 'found', index: 0 }, []), undefined, found)).toEqual(['sq:2,2'])
    // `f0.straight` -> walk starts AT the found tile (not the caller's), then one hop north.
    expect(resolveWalk(tiling, empty, 'sq:0,0', NORTH, 'relative', occ({ kind: 'found', index: 0 }, [{ kind: 'straight' }]), undefined, found)).toEqual(['sq:2,2', 'sq:3,2'])
  })

  it('a found base with a null / missing result yields nothing', () => {
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', occ({ kind: 'found', index: 0 }, []), undefined, [null])).toEqual([])
    expect(resolveWalk(tiling, empty, 'sq:2,2', NORTH, 'relative', occ({ kind: 'found', index: 1 }, []), undefined, [{ tile: 'sq:1,1', heading: 0 }])).toEqual([])
  })

  it('a stale/unknown start tile yields nothing', () => {
    expect(resolveWalk(tiling, empty, 'sq:99,99', NORTH, 'relative', current([{ kind: 'straight' }]))).toEqual([])
  })
})

describe('computeFound', () => {
  const order = tiling.nodes.map((n) => n.id)
  const indexById = new Map(order.map((id, i) => [id, i]))
  const walker = { tile: 'sq:2,2', heading: 0, steps: 0, splits: 0, maxSplit: 1, maxSteps: 1_000_000, movement: 'relative' as const, p: 0, q: 0, r: 0 }

  it('runs the program and returns its find-tile result (the fN tile)', () => {
    const prog = compileProgram('find-tile visited == 0 { move nearest-unvisited }\nmove f0', new Map())
    expect(prog.ok).toBe(true)
    if (!prog.ok) return
    const found = computeFound(tiling, empty, walker, prog.value, order, indexById)
    // Every tile is unvisited, so the nearest match is a neighbour (>= 1 hop from the start).
    expect(found[0]).toBeTruthy()
    expect(found[0]?.tile).not.toBe('sq:2,2')
    // …and resolveWalk then draws the walk to it.
    expect(resolveWalk(tiling, empty, 'sq:2,2', 0, 'relative', occ({ kind: 'found', index: 0 }, []), order, found)).toEqual([found[0]!.tile])
  })

  it('leaves fN unresolved when the find is gated off this tick', () => {
    // The find-tile only runs when [A] > 0; on an empty overlay it doesn't, so f0 stays unfound.
    const prog = compileProgram('if [A] > 0 {\n  find-tile visited == 0 { move nearest-unvisited }\n}\nmove f0', new Map())
    expect(prog.ok).toBe(true)
    if (!prog.ok) return
    const found = computeFound(tiling, empty, walker, prog.value, order, indexById)
    expect(found[0] ?? null).toBeNull()
  })
})
