import { describe, it, expect } from 'vitest'
import { squareTiling, kallebodaTiling, across, clockwiseEdgeOrder, localSideToEdge, nodeById } from '../../tiling'
import { addVisits, type TileState } from '../../canvas'
import { resolveRef, resolveChain, walkChain, straightPartner } from './edges'

// heading is now an EDGE NUMBER (clockwise from top: 0 = north). On a 5×5 square, tile (r,c) id
// `sq:r,c`, edge 0 = north (r+1), 1 = east (c+1), 2 = south (r-1), 3 = west (c-1).
const tiling = squareTiling(5, 5)
const empty: ReadonlyMap<string, TileState> = new Map()
const NORTH = 0

describe('edge resolution on a square (heading = edge number)', () => {
  it('straight exits the heading edge', () => {
    expect(resolveRef(tiling, empty, 'sq:2,2', NORTH, 'relative', { kind: 'straight' })?.tile).toBe('sq:3,2')
    expect(resolveRef(tiling, empty, 'sq:2,2', 1, 'relative', { kind: 'straight' })?.tile).toBe('sq:2,3')
  })

  it('r1 = heading+1 (clockwise), l1 = heading-1 (counter-clockwise)', () => {
    // Facing north (0): r1 -> east (1) -> sq:2,3 ; l1 -> west (3) -> sq:2,1.
    expect(resolveRef(tiling, empty, 'sq:2,2', NORTH, 'relative', { kind: 'turn', dir: 'r', n: 1 })?.tile).toBe('sq:2,3')
    expect(resolveRef(tiling, empty, 'sq:2,2', NORTH, 'relative', { kind: 'turn', dir: 'l', n: 1 })?.tile).toBe('sq:2,1')
    // r2 from north -> south.
    expect(resolveRef(tiling, empty, 'sq:2,2', NORTH, 'relative', { kind: 'turn', dir: 'r', n: 2 })?.tile).toBe('sq:1,2')
  })

  it('edge k is absolute (ignores the heading)', () => {
    for (const h of [0, 1, 2, 3]) {
      expect(resolveRef(tiling, empty, 'sq:2,2', h, 'relative', { kind: 'edge', index: 0 })?.tile).toBe('sq:3,2')
    }
  })

  it('absolute movement measures turns from north, not the heading', () => {
    // heading 1 (east) but absolute: straight is still north, r1 still east.
    expect(resolveRef(tiling, empty, 'sq:2,2', 1, 'absolute', { kind: 'straight' })?.tile).toBe('sq:3,2')
    expect(resolveRef(tiling, empty, 'sq:2,2', 1, 'absolute', { kind: 'turn', dir: 'r', n: 1 })?.tile).toBe('sq:2,3')
  })

  it('returns null at a boundary', () => {
    expect(resolveRef(tiling, empty, 'sq:2,4', 1, 'relative', { kind: 'straight' })).toBeNull()
  })

  it('nearest-unvisited picks the least-turn unvisited neighbour, ties to the lower edge', () => {
    expect(resolveRef(tiling, empty, 'sq:2,2', NORTH, 'relative', { kind: 'unvisited' })?.tile).toBe('sq:3,2')
    const overlay = addVisits(empty, ['sq:3,2'], 0)
    // north now visited; edges 1 (east) and 3 (west) tie at distance 1 -> lower edge (1 = east) wins.
    expect(resolveRef(tiling, overlay, 'sq:2,2', NORTH, 'relative', { kind: 'unvisited' })?.tile).toBe('sq:2,3')
  })

  it('a chain re-aims each hop and lands two tiles away', () => {
    // straight (north) -> sq:3,2 arriving from its south edge; new heading = north again; straight -> sq:4,2.
    const hop = resolveChain(tiling, empty, 'sq:2,2', NORTH, 'relative', [{ kind: 'straight' }, { kind: 'straight' }])
    expect(hop?.tile).toBe('sq:4,2')
  })
})

describe('walkChain returns every tile the chain passes through', () => {
  it('a single hop yields start + destination', () => {
    expect(walkChain(tiling, empty, 'sq:2,2', NORTH, 'relative', [{ kind: 'straight' }])).toEqual(['sq:2,2', 'sq:3,2'])
  })

  it('collects the INTERMEDIATE tile, not just the final one', () => {
    // The whole point vs resolveChain: sq:3,2 must be present between start and end.
    expect(walkChain(tiling, empty, 'sq:2,2', NORTH, 'relative', [{ kind: 'straight' }, { kind: 'straight' }])).toEqual([
      'sq:2,2',
      'sq:3,2',
      'sq:4,2',
    ])
  })

  it('re-aims after a turn', () => {
    // r1 from north -> east into sq:2,3 (arrives facing east), then straight -> sq:2,4.
    expect(walkChain(tiling, empty, 'sq:2,2', NORTH, 'relative', [{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'straight' }])).toEqual([
      'sq:2,2',
      'sq:2,3',
      'sq:2,4',
    ])
  })

  it('empty refs yield just the start tile', () => {
    expect(walkChain(tiling, empty, 'sq:2,2', NORTH, 'relative', [])).toEqual(['sq:2,2'])
  })

  it('truncates at a boundary, keeping the tiles reached so far', () => {
    // From sq:2,3 facing east: straight -> sq:2,4 (edge column), straight -> off-grid -> stop.
    expect(walkChain(tiling, empty, 'sq:2,3', 1, 'relative', [{ kind: 'straight' }, { kind: 'straight' }])).toEqual([
      'sq:2,3',
      'sq:2,4',
    ])
  })

  it('a boundary on the first hop yields just the start', () => {
    expect(walkChain(tiling, empty, 'sq:2,4', 1, 'relative', [{ kind: 'straight' }])).toEqual(['sq:2,4'])
  })

  it('honours absolute movement (turns from north)', () => {
    // Facing east (1) but absolute: straight is north -> sq:3,2.
    expect(walkChain(tiling, empty, 'sq:2,2', 1, 'absolute', [{ kind: 'straight' }])).toEqual(['sq:2,2', 'sq:3,2'])
  })
})

// The wedge is concave. The whole point of the refactor: relative commands are pure edge-number ring
// arithmetic here too, and the hand-crafted straight-through pairing lives ONLY in the arrival heading.
describe('edge resolution on the concave wedge', () => {
  const t = kallebodaTiling(20)
  const wedge = t.nodes.find(
    (n) => n.shape === 'wedge' && n.sides.every((s) => across(t, n.id, s.geometry.localIndex)),
  )!

  it('found an interior wedge', () => {
    expect(wedge).toBeDefined()
  })

  it('a placed walker aiming at edge k leaves via edge k — identical to `move ek`', () => {
    const n = wedge.sides.length
    for (let k = 0; k < n; k += 1) {
      const straight = resolveRef(t, empty, wedge.id, k, 'relative', { kind: 'straight' })
      const direct = resolveRef(t, empty, wedge.id, k, 'relative', { kind: 'edge', index: k })
      expect(straight?.tile, `edge ${k}`).toBe(direct?.tile)
      expect(straight?.tile, `edge ${k}`).toBe(across(t, wedge.id, clockwiseEdgeOrder(wedge)[k])!.tile)
    }
  })

  it('r1 = heading+1 and l1 = heading-1 around the ring — the reported bug', () => {
    const n = wedge.sides.length
    for (let k = 0; k < n; k += 1) {
      const r1 = resolveRef(t, empty, wedge.id, k, 'relative', { kind: 'turn', dir: 'r', n: 1 })
      const edgeUp = resolveRef(t, empty, wedge.id, k, 'relative', { kind: 'edge', index: (k + 1) % n })
      expect(r1?.tile, `r1 off edge ${k} == edge ${(k + 1) % n}`).toBe(edgeUp?.tile)
      const l1 = resolveRef(t, empty, wedge.id, k, 'relative', { kind: 'turn', dir: 'l', n: 1 })
      const edgeDown = resolveRef(t, empty, wedge.id, k, 'relative', { kind: 'edge', index: (k - 1 + n) % n })
      expect(l1?.tile, `l1 off edge ${k} == edge ${(k - 1 + n) % n}`).toBe(edgeDown?.tile)
    }
  })

  it('the wedge straight-through pairing lives in the arrival heading (an involution)', () => {
    const n = wedge.sides.length
    for (let e = 0; e < n; e += 1) {
      const partner = straightPartner(t, wedge, e)
      // symmetric: entering the partner sends straight back out e (the owner-specified {..} pairing).
      expect(straightPartner(t, wedge, partner), `pairing ${e}`).toBe(e)
      // and it never pairs an edge with itself (straight always crosses to a different edge).
      expect(partner).not.toBe(e)
    }
  })

  it('moving INTO a wedge sets the heading to the straight-through partner, so straight continues through', () => {
    // find an octagon->wedge move, then check the arrival heading is the wedge pairing of the entry edge.
    for (const oct of t.nodes) {
      if (oct.shape !== 'octagon') continue
      for (const s of oct.sides) {
        const end = across(t, oct.id, s.geometry.localIndex)
        if (!end) continue
        const nb = nodeById(t, end.tile)!
        if (nb.shape !== 'wedge') continue
        const hop = resolveRef(t, empty, oct.id, localSideToEdge(oct, s.geometry.localIndex), 'relative', { kind: 'edge', index: localSideToEdge(oct, s.geometry.localIndex) })!
        const entryEdge = localSideToEdge(nb, end.side)
        expect(hop.tile).toBe(nb.id)
        expect(hop.heading).toBe(straightPartner(t, nb, entryEdge))
        return
      }
    }
    throw new Error('no octagon->wedge adjacency found')
  })
})
