import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import type { Recipe } from './recipe'
import { prepareFromRecipe } from './prepare'
import { tileOffset } from './remap'

const EDGE_DEF = { id: 't', name: 'Edge', text: 'auto-place line {0, 0, 0}\nmove nearest-unvisited' }

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    schemaVersion: 2,
    app: 'exploroboros',
    tilingId: 'square',
    gridN: 8,
    output: { width: 240, height: 240, edges: false, background: null },
    seeds: [],
    paint: [],
    predicates: [],
    traversers: [EDGE_DEF],
    coloringRules: [],
    ...overrides,
  }
}

describe('prepareFromRecipe auto-place', () => {
  it('resolves an auto-place rule against the EXPORT grid — the top row scales with gridN', () => {
    for (const gridN of [8, 20]) {
      const seeds = prepareFromRecipe(recipe({ gridN }), buildTiling('square', gridN)).seeds
      expect(seeds).toHaveLength(gridN) // one per top-row tile
      expect(seeds.every((s) => s.tile.startsWith(`sq:${gridN - 1},`))).toBe(true) // row N-1 = the top row
    }
  })

  it('a hand-placed seed wins over an auto-place walker on the same tile', () => {
    const tiling = buildTiling('square', 8)
    const handOffset = tileOffset(tiling, 'sq:7,0')! // a top-row tile the auto-place line also covers
    const seeds = prepareFromRecipe(
      recipe({
        seeds: [
          { offset: handOffset, shape: 'square', heading: 0, def: 'Walker', maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 },
        ],
      }),
      tiling,
    ).seeds
    expect(seeds).toHaveLength(8) // 7 auto + the 1 hand on the shared tile (auto there dropped)
    expect(seeds.find((s) => s.tile === 'sq:7,0')!.def).toBe('Walker') // hand wins
  })

  it('a recipe with no auto-place rules yields only the hand seeds (back-compat)', () => {
    const tiling = buildTiling('square', 8)
    const seeds = prepareFromRecipe(recipe({ traversers: [] }), tiling).seeds
    expect(seeds).toHaveLength(0)
  })
})
