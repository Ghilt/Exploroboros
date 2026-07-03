import { describe, it, expect } from 'vitest'
import { squareTiling, stitch, makeShapeDef, SQUARE, nodeById, type Tiling } from '../tiling'
import { addVisit, bumpRegistry, type TileState } from '../canvas'
import { parseExpr, parsePredicate } from './parse'
import { evalNumber, evalPredicate } from './eval'
import type { EvalContext } from './attributes'

type Overlay = ReadonlyMap<string, TileState>

function ctxFor(tiling: Tiling, id: string, overlay: Overlay = new Map(), indexById: ReadonlyMap<string, number> = new Map()): EvalContext {
  const node = nodeById(tiling, id)
  if (!node) throw new Error(`no tile ${id}`)
  return { node, tiling, overlay, indexById }
}
function num(src: string, ctx: EvalContext): number {
  const r = parseExpr(src)
  if (!r.ok) throw new Error(`parse failed: ${r.error.message}`)
  return evalNumber(r.value, ctx)
}
function pred(src: string, ctx: EvalContext): boolean {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(`parse failed: ${r.error.message}`)
  return evalPredicate(r.value, ctx)
}

// A ctx whose @-paths all resolve to `targetId` (or null when it's null) — the traverser layer supplies
// the real, walker-aware resolver; here a stub is enough to prove eval reads the attribute on the
// resolved tile (and falls back when there's no tile).
function ctxWithPath(tiling: Tiling, id: string, targetId: string | null, overlay: Overlay = new Map()): EvalContext {
  const node = nodeById(tiling, id)
  if (!node) throw new Error(`no tile ${id}`)
  return { node, tiling, overlay, indexById: new Map(), nodeForPath: () => (targetId ? nodeById(tiling, targetId) ?? null : null) }
}

const sq = squareTiling(3, 3)

describe('eval — tile attributes', () => {
  it('counts visits', () => {
    let ov: Overlay = new Map()
    ov = addVisit(ov, 'sq:0,0')
    ov = addVisit(ov, 'sq:0,0')
    expect(num('visited', ctxFor(sq, 'sq:0,0', ov))).toBe(2)
    expect(num('visited', ctxFor(sq, 'sq:1,1', ov))).toBe(0)
  })

  it('reads registries with [A], and [A, B] sums them', () => {
    let ov = bumpRegistry(new Map(), 'sq:0,0', 'a', 3)
    ov = bumpRegistry(ov, 'sq:0,0', 'b', 4)
    expect(num('[A]', ctxFor(sq, 'sq:0,0', ov))).toBe(3)
    expect(num('[a]', ctxFor(sq, 'sq:0,0', ov))).toBe(3) // lowercase accepted
    expect(num('[C]', ctxFor(sq, 'sq:0,0', ov))).toBe(0)
    expect(num('[A, B]', ctxFor(sq, 'sq:0,0', ov))).toBe(7) // sum
  })

  it('reads edge count and tile number', () => {
    expect(num('edge-count', ctxFor(sq, 'sq:0,0'))).toBe(4)
    const idx = new Map([['sq:0,0', 7]])
    expect(num('tile-number', ctxFor(sq, 'sq:0,0', new Map(), idx))).toBe(7)
    // missing from the index -> falls back to 0
    expect(num('tile-number', ctxFor(sq, 'sq:0,0'))).toBe(0)
  })

  it('reads coordinates and defaults an out-of-range index', () => {
    expect(num('coordinate[0] default 0', ctxFor(sq, 'sq:1,2'))).toBe(1)
    expect(num('coordinate[1] default 0', ctxFor(sq, 'sq:1,2'))).toBe(2)
    expect(num('coordinate[2] default 9', ctxFor(sq, 'sq:1,2'))).toBe(9)
  })

  it('reads first/latest/indexed step, defaulting when absent', () => {
    let ov: Overlay = new Map()
    ov = addVisit(ov, 'sq:0,0', 3)
    ov = addVisit(ov, 'sq:0,0', 7)
    const ctx = ctxFor(sq, 'sq:0,0', ov)
    expect(num('first-step default -1', ctx)).toBe(3)
    expect(num('latest-step default -1', ctx)).toBe(7)
    expect(num('step[1] default -1', ctx)).toBe(7)
    expect(num('step[5] default -1', ctx)).toBe(-1)
    // an unvisited tile defaults
    expect(num('latest-step default -1', ctxFor(sq, 'sq:2,2', ov))).toBe(-1)
  })
})

describe('eval — arithmetic', () => {
  it('applies operators and precedence', () => {
    let ov: Overlay = new Map()
    ov = addVisit(ov, 'sq:0,0')
    ov = addVisit(ov, 'sq:0,0')
    const ctx = ctxFor(sq, 'sq:0,0', ov)
    expect(num('visited * 2 + 1', ctx)).toBe(5)
    expect(num('7 % 3', ctx)).toBe(1)
    expect(num('-visited', ctx)).toBe(-2)
  })

  it('returns 0 for divide/modulo by zero', () => {
    const ctx = ctxFor(sq, 'sq:0,0')
    expect(num('5 / 0', ctx)).toBe(0)
    expect(num('5 % 0', ctx)).toBe(0)
  })
})

describe('eval — predicates', () => {
  it('compares and combines with boolean logic', () => {
    let ov: Overlay = new Map()
    ov = addVisit(ov, 'sq:0,0')
    ov = addVisit(ov, 'sq:0,0')
    const ctx = ctxFor(sq, 'sq:0,0', ov)
    expect(pred('visited == 2', ctx)).toBe(true)
    expect(pred('visited > 5', ctx)).toBe(false)
    expect(pred('visited == 2 and edge-count == 4', ctx)).toBe(true)
    expect(pred('not visited == 2', ctx)).toBe(false)
    expect(pred('visited == 1 or edge-count == 4', ctx)).toBe(true)
    expect(pred('visited % 2 == 0', ctx)).toBe(true)
  })
})

// A minimal hand-built tiling where one neighbour shares TWO edges: an L-shaped hexagon A with a
// square B filling its notch. They touch along the two segments {(1,1)-(2,1)} and {(1,1)-(1,2)}.
function twoEdgeNeighbourTiling(): Tiling {
  return stitch(
    [
      {
        id: 'A',
        shape: 'ell',
        lattice: [0],
        vertices: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 0, y: 2 },
        ],
      },
      {
        id: 'B',
        shape: 'square',
        lattice: [1],
        vertices: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 1, y: 2 },
        ],
      },
    ],
    { ell: makeShapeDef('ell', 6), square: SQUARE },
    { id: 'adj', name: 'adj', vertexConfig: '-', chiral: false, edgeToEdge: false, latticeLabels: ['k'] },
  )
}

describe('eval — tile-type and rotation', () => {
  it('tests the tile shape', () => {
    const ctx = ctxFor(sq, 'sq:0,0')
    expect(pred('tile-type == square', ctx)).toBe(true)
    expect(pred('tile-type == triangle', ctx)).toBe(false)
    expect(pred('tile-type != triangle', ctx)).toBe(true)
  })

  it('exposes a stable rotation in degrees', () => {
    // square sq:0,0 vertices wind CCW from the bottom-left, so the centroid->vertex0 direction is 225°
    expect(num('rotation', ctxFor(sq, 'sq:0,0'))).toBe(225)
    const r = num('rotation', ctxFor(sq, 'sq:1,1'))
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThan(360)
  })
})

describe('eval — visited-edges vs visited-neighbors (+ legacy aliases)', () => {
  it('counts shared edges vs distinct tiles for a two-edge neighbour', () => {
    const t = twoEdgeNeighbourTiling()
    const ov = addVisit(new Map(), 'B') // B is the single neighbour, sharing two edges with A
    const ctx = ctxFor(t, 'A', ov)
    expect(num('visited-edges', ctx)).toBe(2) // two visited edges
    expect(num('visited-neighbors', ctx)).toBe(1) // one distinct visited tile
  })

  it('keeps the old names working as aliases', () => {
    const t = twoEdgeNeighbourTiling()
    const ctx = ctxFor(t, 'A', addVisit(new Map(), 'B'))
    expect(num('adjacent-visited', ctx)).toBe(2)
    expect(num('adjacent-visited-unique', ctx)).toBe(1)
  })
})

describe('eval — attribute @-paths (via the nodeForPath hook)', () => {
  it('reads a numeric attribute on the tile the path resolves to', () => {
    let ov: Overlay = new Map()
    ov = addVisit(ov, 'sq:2,2')
    ov = addVisit(ov, 'sq:2,2')
    // visited@e1 → the stub points at sq:2,2 (2 visits); the current tile sq:0,0 has none
    expect(num('visited@e1', ctxWithPath(sq, 'sq:0,0', 'sq:2,2', ov))).toBe(2)
    expect(num('visited', ctxWithPath(sq, 'sq:0,0', 'sq:2,2', ov))).toBe(0) // no path = current tile
  })

  it('reads a registry on the resolved tile', () => {
    const ov = bumpRegistry(new Map(), 'sq:2,2', 'a', 5)
    expect(num('[A@e1]', ctxWithPath(sq, 'sq:0,0', 'sq:2,2', ov))).toBe(5)
  })

  it('falls back to the default when the path resolves to nothing (boundary)', () => {
    expect(num('visited@e1', ctxWithPath(sq, 'sq:0,0', null))).toBe(0)
    expect(num('coordinate[0]@e1 default 7', ctxWithPath(sq, 'sq:0,0', null))).toBe(7)
  })

  it('falls back with no resolver (a walker-free / coloring context)', () => {
    // ctxFor supplies no nodeForPath, so any path resolves to nothing.
    expect(num('visited@e1', ctxFor(sq, 'sq:0,0'))).toBe(0)
  })

  it('tests tile-type on the resolved tile; a missing tile matches nothing', () => {
    expect(pred('tile-type@e1 == square', ctxWithPath(sq, 'sq:0,0', 'sq:2,2'))).toBe(true)
    expect(pred('tile-type@e1 == triangle', ctxWithPath(sq, 'sq:0,0', 'sq:2,2'))).toBe(false)
    expect(pred('tile-type@e1 == square', ctxWithPath(sq, 'sq:0,0', null))).toBe(false) // no tile -> false
    expect(pred('tile-type@e1 != square', ctxWithPath(sq, 'sq:0,0', null))).toBe(false) // still false
  })
})
