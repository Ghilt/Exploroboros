import { describe, it, expect } from 'vitest'
import { squareTiling } from './square'
import { across, neighborEdges, uniqueNeighbors, opposite, isBoundary, clockwiseEdgeOrder } from '../graph'

describe('squareTiling 20x20', () => {
  const t = squareTiling(20, 20)

  it('has rows*cols tiles with unique sq:r,c ids', () => {
    expect(t.nodes.length).toBe(400)
    const ids = new Set(t.nodes.map((n) => n.id))
    expect(ids.size).toBe(400)
    expect(ids.has('sq:0,0')).toBe(true)
    expect(ids.has('sq:19,19')).toBe(true)
  })

  it('has 840 edges = 760 interior + 80 boundary', () => {
    const boundary = t.edges.filter(isBoundary).length
    expect(t.edges.length).toBe(840)
    expect(boundary).toBe(80)
    expect(t.edges.length - boundary).toBe(760)
  })

  it('lattice coords round-trip to the id', () => {
    for (const n of t.nodes) {
      const [r, c] = n.lattice
      expect(n.id).toBe(`sq:${r},${c}`)
    }
  })

  it('reciprocity: crossing a side and back returns the origin', () => {
    for (const n of t.nodes) {
      for (const side of n.sides) {
        const k = side.geometry.localIndex
        const end = across(t, n.id, k)
        if (!end) continue // boundary
        expect(across(t, end.tile, end.side)).toEqual({ tile: n.id, side: k })
      }
    }
  })

  it('opposite sides: 0<->2 (S<->N), 1<->3 (E<->W)', () => {
    expect(opposite(t, 'sq:5,5', 0)).toEqual([2])
    expect(opposite(t, 'sq:5,5', 1)).toEqual([3])
    expect(opposite(t, 'sq:5,5', 2)).toEqual([0])
    expect(opposite(t, 'sq:5,5', 3)).toEqual([1])
  })

  it('neighbour counts: interior 4, edge 3, corner 2; per-edge == unique (edge-to-edge)', () => {
    expect(uniqueNeighbors(t, 'sq:10,10').length).toBe(4)
    expect(uniqueNeighbors(t, 'sq:0,10').length).toBe(3)
    expect(uniqueNeighbors(t, 'sq:0,0').length).toBe(2)
    expect(neighborEdges(t, 'sq:10,10').length).toBe(uniqueNeighbors(t, 'sq:10,10').length)
  })

  it('boundary tiles have the expected number of wall sides', () => {
    const walls = (id: string) => {
      const node = t.nodes.find((n) => n.id === id)
      if (!node) throw new Error(`no tile ${id}`)
      return node.sides.filter((s) => isBoundary(t.edges[s.edgeId])).length
    }
    expect(walls('sq:0,0')).toBe(2)
    expect(walls('sq:0,10')).toBe(1)
    expect(walls('sq:10,10')).toBe(0)
  })

  it('bounds match the grid extent', () => {
    expect(t.bounds).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 20 })
  })

  it('numbers edges clockwise from the top (local sides top, right, bottom, left = 2,1,0,3)', () => {
    const node = t.nodes.find((n) => n.id === 'sq:5,5')
    if (!node) throw new Error('no tile sq:5,5')
    expect(clockwiseEdgeOrder(node)).toEqual([2, 1, 0, 3])
  })

  it('is deterministic', () => {
    const a = squareTiling(3, 3)
    const b = squareTiling(3, 3)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
    expect(a.edges.length).toBe(b.edges.length)
  })
})
