import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import { nodeById, uniqueNeighbors } from '../tiling'
import { blobTiles, lineTiles } from './geometry'

describe('lineTiles geometry', () => {
  it('a horizontal line at 0% is the top row; at 100% the bottom row', () => {
    const t = buildTiling('square', 6) // rows 0..5, y-up so row 5 is the top
    expect(lineTiles(t, 0, 0).every((n) => n.lattice[0] === 5)).toBe(true)
    expect(lineTiles(t, 0, 100).every((n) => n.lattice[0] === 0)).toBe(true)
  })

  it('is grid-relative — the top row scales with the grid', () => {
    for (const n of [6, 40]) {
      const top = lineTiles(buildTiling('square', n), 0, 0)
      expect(top).toHaveLength(n)
      expect(top.every((node) => node.lattice[0] === n - 1)).toBe(true)
    }
  })
})

describe('blobTiles geometry', () => {
  it('radius 1 is exactly one tile (the nearest to the point)', () => {
    const t = buildTiling('square', 8)
    const one = blobTiles(t, 50, 50, 1)
    expect(one).toHaveLength(1)
  })

  it('radius 2 is the nearest tile plus its direct neighbours', () => {
    const t = buildTiling('square', 8)
    const two = blobTiles(t, 50, 50, 2)
    const start = blobTiles(t, 50, 50, 1)[0]
    const expected = new Set([start.id, ...uniqueNeighbors(t, start.id)])
    expect(new Set(two.map((n) => n.id))).toEqual(expected)
  })

  it('places at the corner for 0,0 (top-left) and 100,100 (bottom-right)', () => {
    const t = buildTiling('square', 6)
    // top-left = min x, max y (y-up) → row 5, col 0
    expect(blobTiles(t, 0, 0, 1)[0].lattice).toEqual([5, 0])
    // bottom-right = max x, min y → row 0, col 5
    expect(blobTiles(t, 100, 100, 1)[0].lattice).toEqual([0, 5])
  })

  it('does not crash on concave (kalleboda) or ragged (hexagonal) tilings', () => {
    for (const id of ['kalleboda', 'hexagonal']) {
      const t = buildTiling(id, 6)
      const blob = blobTiles(t, 50, 50, 3)
      expect(blob.length).toBeGreaterThan(0)
      expect(blob.every((n) => nodeById(t, n.id) !== undefined)).toBe(true)
    }
  })
})

describe('blobTiles guard-aware anchor (accept)', () => {
  const t = buildTiling('trihexagonal', 12) // hexagons + triangles

  const point = (xPct: number, yPct: number) => ({
    x: t.bounds.minX + (xPct / 100) * (t.bounds.maxX - t.bounds.minX),
    y: t.bounds.maxY - (yPct / 100) * (t.bounds.maxY - t.bounds.minY),
  })
  const nearest = (pt: { x: number; y: number }, ok: (n: (typeof t.nodes)[number]) => boolean) => {
    let best = Infinity
    let node: (typeof t.nodes)[number] | null = null
    for (const n of t.nodes) {
      if (!ok(n)) continue
      const d = (n.centroid.x - pt.x) ** 2 + (n.centroid.y - pt.y) ** 2
      if (d < best) {
        best = d
        node = n
      }
    }
    return node
  }

  it('without accept, still returns the raw nearest tile (unchanged behaviour)', () => {
    const [raw] = blobTiles(t, 50, 50, 1)
    expect(raw.id).toBe(nearest(point(50, 50), () => true)!.id)
  })

  it('snaps the anchor to the nearest tile that PASSES accept', () => {
    const [anchor] = blobTiles(t, 50, 50, 1, (n) => n.shape === 'hexagon')
    expect(anchor.shape).toBe('hexagon')
    expect(anchor.id).toBe(nearest(point(50, 50), (n) => n.shape === 'hexagon')!.id) // the NEAREST hexagon
  })

  it('finds a matching tile even when the exact nearest tile is a different type', () => {
    // Aim the point AT a triangle's centre → the raw nearest is that triangle, not a hexagon.
    const tri = t.nodes.find((n) => n.shape === 'triangle')!
    const xPct = ((tri.centroid.x - t.bounds.minX) / (t.bounds.maxX - t.bounds.minX)) * 100
    const yPct = ((t.bounds.maxY - tri.centroid.y) / (t.bounds.maxY - t.bounds.minY)) * 100
    const [raw] = blobTiles(t, xPct, yPct, 1)
    expect(raw.shape).toBe('triangle') // exact nearest is the targeted triangle
    const [anchor] = blobTiles(t, xPct, yPct, 1, (n) => n.shape === 'hexagon')
    expect(anchor.shape).toBe('hexagon') // still places — snapped to the nearest hexagon
    expect(anchor.id).not.toBe(raw.id)
  })

  it('returns [] only when nothing passes (a ridiculous predicate)', () => {
    expect(blobTiles(t, 50, 50, 1, () => false)).toEqual([])
    expect(blobTiles(t, 50, 50, 1, (n) => n.shape === 'octagon')).toEqual([]) // no octagons here
  })
})
