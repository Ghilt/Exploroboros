import { describe, it, expect } from 'vitest'
import { kallebodaTiling, neighborEdges, uniqueNeighbors, isBoundary, opposite, across, clockwiseEdgeOrder } from '../index'

describe('kalleboda (octagon + wedge) tiling', () => {
  it('builds without throwing and mixes octagons and wedges', () => {
    const t = kallebodaTiling(20)
    expect(t.meta.id).toBe('kalleboda')
    expect(t.nodes.length).toBeGreaterThan(50)
    const shapes = new Set(t.nodes.map((n) => n.shape))
    expect(shapes.has('octagon')).toBe(true)
    expect(shapes.has('wedge')).toBe(true)
  })

  it('keeps the ~6:4 octagon:wedge ratio of the repeating cell', () => {
    const t = kallebodaTiling(30)
    const octs = t.nodes.filter((n) => n.shape === 'octagon').length
    const wedges = t.nodes.filter((n) => n.shape === 'wedge').length
    expect(octs / wedges).toBeGreaterThan(1.2)
    expect(octs / wedges).toBeLessThan(1.8)
  })

  it('stitches shared edges — an interior octagon has all 8 edges paired', () => {
    const t = kallebodaTiling(24)
    const maxEdges = Math.max(
      ...t.nodes.filter((n) => n.shape === 'octagon').map((n) => neighborEdges(t, n.id).length),
    )
    expect(maxEdges).toBe(8)
  })

  it('reproduces the two-edged-adjacency quirk (a neighbour shared by two edges)', () => {
    const t = kallebodaTiling(24)
    const twoEdge = t.nodes.some((n) => neighborEdges(t, n.id).length > uniqueNeighbors(t, n.id).length)
    expect(twoEdge).toBe(true)
  })

  it('has a ragged border — both boundary and interior edges exist', () => {
    const t = kallebodaTiling(16)
    expect(t.edges.some(isBoundary)).toBe(true)
    expect(t.edges.some((e) => !isBoundary(e))).toBe(true)
  })

  it('is deterministic', () => {
    const a = kallebodaTiling(18)
    const b = kallebodaTiling(18)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
    expect(a.edges.length).toBe(b.edges.length)
  })

  it('wedge declares a hand-picked straight-through opposite pairing (concave shape)', () => {
    const t = kallebodaTiling(20)
    expect(t.shapes.wedge.straightThroughOpposite).toBe(true)
    // Local CCW sides pair {0,7} {1,3} {2,5} {4,6} — the owner's hand-picked mapping (the spike edges
    // 0,7 pass through to each other; the rest cross the body). The regular (k+4)%8 antipode lands
    // somewhere visually wrong on this concave tile.
    expect(t.shapes.wedge.oppositeSides).toEqual([[7], [3], [5], [1], [6], [2], [4], [0]])
    // Reciprocal on a real wedge tile: opposite(opposite(k)) === k.
    const wedge = t.nodes.find((n) => n.shape === 'wedge')!
    for (let k = 0; k < 8; k += 1) {
      expect(opposite(t, wedge.id, opposite(t, wedge.id, k)[0])[0]).toBe(k)
    }
  })

  it('no straight-through pair collapses onto a two-edged-adjacency (same-tile) pair', () => {
    // The owner's invariant: straight always crosses to a DIFFERENT tile. The wedge's notch sides
    // ({0,1}/{3,4}/{6,7}) each share one octagon (two-edged adjacency); the pairing must avoid them.
    const t = kallebodaTiling(20)
    const wedge = t.nodes.find(
      (n) => n.shape === 'wedge' && n.sides.every((s) => across(t, n.id, s.geometry.localIndex)),
    )!
    for (let k = 0; k < 8; k += 1) {
      const o = opposite(t, wedge.id, k)[0]
      expect(across(t, wedge.id, o)!.tile, `side ${k} -> opp ${o}`).not.toBe(across(t, wedge.id, k)!.tile)
    }
  })

  it('every octagon numbers its due-north edge as edge 0 (0/360 seam robustness)', () => {
    // Regression: a flat-top octagon's north edge normal can compute to a hair over 90° (atan2
    // round-off / weld drift); the old clockwiseFromTopKey wrapped that to ~359.999 and sorted it
    // LAST, so slot-0 octagons numbered their edges rotated by one (`edge 0` pointed NE, not N).
    const t = kallebodaTiling(20)
    for (const node of t.nodes) {
      if (node.shape !== 'octagon') continue
      const edge0 = node.sides[clockwiseEdgeOrder(node)[0]]
      const deg = (edge0.geometry.normalAngle * 180) / Math.PI
      expect(Math.abs(deg - 90), `octagon ${node.id} edge 0 normal ${deg.toFixed(4)}°`).toBeLessThan(1)
    }
  })

  it('octagons keep the regular antipodal opposite (only the wedge is special)', () => {
    const t = kallebodaTiling(20)
    expect(t.shapes.octagon.straightThroughOpposite).toBeUndefined()
    expect(t.shapes.octagon.oppositeSides).toEqual([[4], [5], [6], [7], [0], [1], [2], [3]])
  })
})
