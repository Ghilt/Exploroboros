import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import { nodeById } from '../tiling'
import { compileProgram, type Program } from './lang'
import { lineTiles, resolveAutoPlacements, mergeByTile } from './autoplace'
import type { Traverser } from './types'

const EMPTY = new Map()

function def(text: string): Program {
  const c = compileProgram(text, new Map())
  if (!c.ok) throw new Error(c.error.message)
  return c.value
}

function resolve(text: string, tilingId: string, n: number): Traverser[] {
  return resolveAutoPlacements(new Map([['T', def(text)]]), buildTiling(tilingId, n), EMPTY, EMPTY)
}

describe('lineTiles geometry', () => {
  it('a horizontal line at 0% is the top row; at 100% the bottom row', () => {
    const t = buildTiling('square', 6) // rows 0..5, y-up so row 5 is the top
    const top = lineTiles(t, 0, 0)
    expect(top).toHaveLength(6)
    expect(top.every((node) => node.lattice[0] === 5)).toBe(true)
    const bottom = lineTiles(t, 0, 100)
    expect(bottom.every((node) => node.lattice[0] === 0)).toBe(true)
  })

  it('a vertical line at 0% is the left column (measured from the top-left)', () => {
    const t = buildTiling('square', 6)
    const left = lineTiles(t, 90, 0)
    expect(left).toHaveLength(6)
    expect(left.every((node) => node.lattice[1] === 0)).toBe(true)
  })

  it('a diagonal picks the staircase it crosses (not one row/column)', () => {
    const t = buildTiling('square', 6)
    const diag = lineTiles(t, 45, 50)
    expect(diag.length).toBeGreaterThan(1)
    const rows = new Set(diag.map((n) => n.lattice[0]))
    const cols = new Set(diag.map((n) => n.lattice[1]))
    expect(rows.size).toBeGreaterThan(1)
    expect(cols.size).toBeGreaterThan(1)
  })

  it('is grid-relative — the top row scales with the grid, unlike an absolute offset', () => {
    for (const n of [6, 40]) {
      const t = buildTiling('square', n)
      const top = lineTiles(t, 0, 0)
      expect(top).toHaveLength(n)
      expect(top.every((node) => node.lattice[0] === n - 1)).toBe(true)
    }
  })
})

describe('resolveAutoPlacements', () => {
  it('places a walker on each selected tile, aimed at edge % sides', () => {
    const seeds = resolve('auto-place line {0, 0, 9}\nmove nearest-unvisited', 'square', 6)
    expect(seeds).toHaveLength(6)
    expect(seeds.every((s) => s.heading === 1)).toBe(true) // 9 % 4 sides
    expect(seeds.every((s) => s.def === 'T')).toBe(true)
  })

  it('filters candidates by a tile predicate — a candidate is kept iff it matches', () => {
    const t = buildTiling('truncated-square', 12)
    const all = resolve('auto-place line {45, 50, 0}', 'truncated-square', 12) // a diagonal crosses both shapes
    const octs = resolve('auto-place line {45, 50, 0} if tile-type == octagon', 'truncated-square', 12)
    const kept = new Set(octs.map((s) => s.tile))
    expect(octs.length).toBeGreaterThan(0)
    // Every candidate on the line is kept exactly when it's an octagon (drops the squares it crosses).
    for (const s of all) expect(kept.has(s.tile)).toBe(nodeById(t, s.tile)!.shape === 'octagon')
  })

  it('a guard can reduce a selection to nothing (no octagons on a plain square grid)', () => {
    expect(resolve('auto-place line {0, 50, 0} if tile-type == octagon', 'square', 6)).toHaveLength(0)
  })

  it('dedups a tile hit by two rules — the earlier rule wins the heading', () => {
    const seeds = resolveAutoPlacements(
      new Map([['T', def('auto-place line {0, 0, 0}\nauto-place line {0, 0, 2}')]]),
      buildTiling('square', 6),
      EMPTY,
      EMPTY,
    )
    expect(seeds).toHaveLength(6) // top row, not 12
    expect(seeds.every((s) => s.heading === 0)).toBe(true) // first rule's edge, not the second
  })

  it('does not crash on concave (kalleboda) or ragged (hexagonal) tilings', () => {
    for (const id of ['kalleboda', 'hexagonal']) {
      const t = buildTiling(id, 6)
      const seeds = resolveAutoPlacements(new Map([['T', def('auto-place line {0, 30, 0}')]]), t, EMPTY, EMPTY)
      expect(seeds.every((s) => nodeById(t, s.tile) !== undefined)).toBe(true)
    }
  })
})

describe('mergeByTile', () => {
  it('keeps one walker per tile, primary (hand) winning', () => {
    const auto = resolve('auto-place line {0, 0, 3}', 'square', 6) // 6 auto walkers on the top row
    const handTile = auto[0].tile
    const hand: Traverser = { ...auto[0], id: 'hand', def: 'Hand', heading: 0 }
    const merged = mergeByTile([hand], auto)
    expect(merged).toHaveLength(6) // hand replaces the auto on its tile; the other 5 auto remain
    const onTile = merged.find((t) => t.tile === handTile)!
    expect(onTile.def).toBe('Hand')
    expect(onTile.heading).toBe(0)
  })
})
