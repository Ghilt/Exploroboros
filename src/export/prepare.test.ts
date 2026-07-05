import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import type { Recipe } from './recipe'
import { prepareFromRecipe } from './prepare'
import { tileOffset } from './remap'

// A plain walker definition; the Initial-state document references it as t1 (first in the list) or by name.
const EDGE_DEF = { id: 't', name: 'edge', text: 'move nearest-unvisited' }

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    schemaVersion: 4,
    app: 'exploroboros',
    tilingId: 'square',
    gridW: 8,
    gridH: 8,
    output: { width: 240, height: 240, edges: false, background: null },
    seeds: [],
    paint: [],
    predicates: [],
    traversers: [EDGE_DEF],
    coloringRules: [],
    initialState: '',
    ...overrides,
  }
}

describe('prepareFromRecipe initial-state seeding', () => {
  it('resolves an Initial-state rule against the EXPORT grid — the top row scales with gridN', () => {
    for (const gridN of [8, 20]) {
      const seeds = prepareFromRecipe(
        recipe({ gridW: gridN, gridH: gridN, initialState: 'auto-place line {t1, 0, 0, 0}' }),
        buildTiling('square', gridN),
      ).seeds
      expect(seeds).toHaveLength(gridN) // one per top-row tile
      expect(seeds.every((s) => s.tile.startsWith(`sq:${gridN - 1},`))).toBe(true) // row N-1 = the top row
    }
  })

  it('sets a registry from the Initial-state document into the base overlay', () => {
    const base = prepareFromRecipe(
      recipe({ initialState: 'auto-place line {[A], 0, 0, 5}' }),
      buildTiling('square', 8),
    ).baseOverlay
    const top = [...base.entries()].filter(([id]) => id.startsWith('sq:7,'))
    expect(top).toHaveLength(8)
    expect(top.every(([, st]) => st.a === 5)).toBe(true)
  })

  it('a hand-placed seed wins over an init-placed walker on the same tile', () => {
    const tiling = buildTiling('square', 8)
    const handOffset = tileOffset(tiling, 'sq:7,0')! // a top-row tile the init line also covers
    const seeds = prepareFromRecipe(
      recipe({
        initialState: 'auto-place line {t1, 0, 0, 0}',
        seeds: [
          { offset: handOffset, shape: 'square', heading: 0, def: 'Walker', maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 },
        ],
      }),
      tiling,
    ).seeds
    expect(seeds).toHaveLength(8) // 7 init + the 1 hand on the shared tile (init there dropped)
    expect(seeds.find((s) => s.tile === 'sq:7,0')!.def).toBe('Walker') // hand wins
  })

  it('a recipe with no Initial-state document yields only the hand seeds (back-compat)', () => {
    const tiling = buildTiling('square', 8)
    const seeds = prepareFromRecipe(recipe({ traversers: [], initialState: '' }), tiling).seeds
    expect(seeds).toHaveLength(0)
  })
})
