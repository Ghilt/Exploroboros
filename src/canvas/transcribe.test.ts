import { describe, it, expect } from 'vitest'
import { squareTiling, kallebodaTiling, triangularTiling, across, edgeToLocalSide, nodeById, type Tiling } from '../tiling'
import { walkChain, type EdgeRef } from '../traverse/lang'
import type { TileState } from './overlay'
import { transcribeGesture } from './transcribe'

// transcribeGesture is the inverse of walkChain, so the load-bearing test is the round-trip: transcribe a
// tile sequence, then walk the produced refs and get the SAME sequence back. That proves the edge-crossing
// detection, the straight-through partner, and the heading re-aim all match the engine — without
// hand-computing edge numbers on the exotic tilings.

const empty: ReadonlyMap<string, TileState> = new Map()

const square = squareTiling(9, 9) // ids sq:r,c — edge 0=N(r+1), 1=E(c+1), 2=S(r-1), 3=W(c-1)

describe('transcribeGesture — explicit strings on the square', () => {
  it('writes an absolute path (eN per hop) when the start tile has no walker', () => {
    // Drag east twice: each hop exits edge 1 (east).
    expect(transcribeGesture(square, ['sq:4,4', 'sq:4,5', 'sq:4,6'], null)).toMatchObject({ text: 'e1.e1', kind: 'path' })
  })

  it('writes a relative path threaded from the walker heading', () => {
    // Heading 0 (north). Hop 1 north (edge 0) = straight; arrive facing north again. Hop 2 east (edge 1) = r1.
    expect(transcribeGesture(square, ['sq:4,4', 'sq:5,4', 'sq:5,5'], 0)).toMatchObject({ text: 'straight.r1', kind: 'path' })
  })

  it('uses back for a U-turn (heading north, drag south)', () => {
    expect(transcribeGesture(square, ['sq:4,4', 'sq:3,4'], 0)).toMatchObject({ text: 'back', kind: 'path' })
  })

  it('falls back to the tile TYPE when no edge is crossed (a single tile)', () => {
    const res = transcribeGesture(square, ['sq:4,4'], 0)
    expect(res.kind).toBe('tile-type')
    expect(res.text).toBe(nodeById(square, 'sq:4,4')!.shape)
    expect(res.refs).toEqual([])
  })

  it('stops the path at a non-adjacent jump (a sampler gap)', () => {
    // sq:4,5 -> sq:7,7 aren't adjacent, so only the first hop is emitted.
    expect(transcribeGesture(square, ['sq:4,4', 'sq:4,5', 'sq:7,7'], null)).toMatchObject({ text: 'e1', kind: 'path' })
  })
})

// Every start tile + neighbour + a few headings: the produced 1-hop relative path must walk back to the
// neighbour. Exercises the crossing-edge pick + partner on each shape, including the octagon+wedge
// two-edge adjacency and the odd-sided triangle.
function assertEveryNeighbourRoundTrips(tiling: Tiling) {
  for (const node of tiling.nodes) {
    const n = node.sides.length
    for (let e = 0; e < n; e += 1) {
      const end = across(tiling, node.id, edgeToLocalSide(node, e))
      if (!end) continue
      for (const h of [0, 1, n - 1]) {
        const res = transcribeGesture(tiling, [node.id, end.tile], h)
        const walked = walkChain(tiling, empty, node.id, h, 'relative', res.refs)
        expect(walked, `${node.id} -> ${end.tile} @ heading ${h} gave "${res.text}"`).toEqual([node.id, end.tile])
      }
    }
  }
}

// Find the first interior start where `refs` walks without truncating, then transcribe that walk and prove
// it round-trips — exercises the HEADING THREADING across several re-aiming hops.
function assertMultiHopRoundTrips(tiling: Tiling, refs: EdgeRef[]) {
  for (const node of tiling.nodes) {
    const tiles = walkChain(tiling, empty, node.id, 0, 'relative', refs)
    if (tiles.length !== refs.length + 1) continue
    const res = transcribeGesture(tiling, tiles, 0)
    expect(walkChain(tiling, empty, tiles[0], 0, 'relative', res.refs), `from ${node.id}`).toEqual(tiles)
    return
  }
  throw new Error('no interior start found for the multi-hop walk')
}

const straight: EdgeRef = { kind: 'straight' }
const r1: EdgeRef = { kind: 'turn', dir: 'r', n: 1 }
const chain3 = [straight, r1, straight]

describe('transcribeGesture — round-trips through walkChain', () => {
  it('square: every neighbour (1 hop)', () => assertEveryNeighbourRoundTrips(square))
  it('square: a multi-hop threaded walk', () => assertMultiHopRoundTrips(square, chain3))

  const kb = kallebodaTiling(20) // octagon + wedge: TWO-edge adjacencies + a concave tile
  it('kalleboda: every neighbour (1 hop) — incl. octagon<->wedge two-edge crossings', () => assertEveryNeighbourRoundTrips(kb))
  it('kalleboda: a multi-hop threaded walk', () => assertMultiHopRoundTrips(kb, chain3))

  const tri = triangularTiling(12) // odd-sided: `back` reaches the lower of two opposite edges
  it('triangular: every neighbour (1 hop)', () => assertEveryNeighbourRoundTrips(tri))
  it('triangular: a multi-hop threaded walk', () => assertMultiHopRoundTrips(tri, chain3))

  it('absolute (eN) refs round-trip regardless of heading', () => {
    const tiles = ['sq:4,4', 'sq:4,5', 'sq:5,5']
    const res = transcribeGesture(square, tiles, null)
    // edge refs ignore the heading, so any heading + either movement reproduces the walk.
    expect(walkChain(square, empty, tiles[0], 0, 'absolute', res.refs)).toEqual(tiles)
    expect(walkChain(square, empty, tiles[0], 3, 'relative', res.refs)).toEqual(tiles)
  })
})
