import { describe, it, expect } from 'vitest'
import { computeExport } from './generate'
import { DESKTOP_CAPS } from './sizing'
import type { Recipe } from './recipe'

// A complete recipe: one built-in Walker seeded at the centre of a 6×6 square grid, coloured wherever
// a tile is visited. Exercises the whole pure pipeline (build → remap → run → colorize → size).
function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    schemaVersion: 2,
    app: 'exploroboros',
    tilingId: 'square',
    gridN: 6,
    output: { width: 240, height: 240, edges: false, background: null },
    seeds: [
      { offset: { x: 0, y: 0 }, shape: 'square', heading: 0, def: 'Walker', maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 },
    ],
    paint: [],
    predicates: [],
    traversers: [],
    coloringRules: [{ id: 'r', predicate: { kind: 'ref', id: 'visited' }, color: { kind: 'flat', hex: '#ff0000' }, opacity: 1 }],
    ...overrides,
  }
}

describe('computeExport', () => {
  it('runs the fractal and colours the visited tiles', () => {
    const out = computeExport(recipe(), DESKTOP_CAPS)
    expect(out.hitCap).toBe(false)
    expect(out.ticks).toBeGreaterThan(0)
    expect(out.colorFor.size).toBeGreaterThan(1) // the walker visited several tiles, all coloured
    expect(out.size.width).toBe(240) // honours the requested width × height
    expect(out.size.height).toBe(240)
  })

  it('builds the export tiling at the recipe grid size, independent of any live grid', () => {
    const out = computeExport(recipe({ gridN: 10 }), DESKTOP_CAPS)
    expect(out.tiling.nodes.length).toBe(100) // 10×10
  })

  it('produces an empty colour map when nothing matches the rules', () => {
    const out = computeExport(recipe({ coloringRules: [] }), DESKTOP_CAPS)
    expect(out.colorFor.size).toBe(0)
  })

  it('seeds walkers from an auto-place rule (no hand seeds) and runs them', () => {
    const out = computeExport(
      recipe({
        seeds: [],
        gridN: 8,
        traversers: [{ id: 't', name: 'Edge', text: 'auto-place line {0, 0, 0}\nmove nearest-unvisited' }],
      }),
      DESKTOP_CAPS,
    )
    expect(out.hitCap).toBe(false)
    expect(out.ticks).toBeGreaterThan(0)
    expect(out.colorFor.size).toBeGreaterThan(8) // the top-row walkers left trails beyond their start row
  })
})
