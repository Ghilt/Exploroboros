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
