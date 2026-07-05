import { describe, it, expect } from 'vitest'
import { computeExport } from './generate'
import { DESKTOP_CAPS } from './sizing'
import type { Recipe } from './recipe'

// A complete recipe: one built-in Walker seeded at the centre of a 6×6 square grid, coloured wherever
// a tile is visited. Exercises the whole pure pipeline (build → remap → run → colorize → size).
function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    schemaVersion: 4,
    app: 'exploroboros',
    tilingId: 'square',
    gridW: 6,
    gridH: 6,
    output: { width: 240, height: 240, edges: false, background: null },
    seeds: [
      { offset: { x: 0, y: 0 }, shape: 'square', heading: 0, def: 'Walker', maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 },
    ],
    paint: [],
    predicates: [],
    traversers: [],
    coloringRules: [{ id: 'r', predicate: { kind: 'ref', id: 'visited' }, color: { kind: 'flat', hex: '#ff0000' }, opacity: 1 }],
    initialState: '',
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
    const out = computeExport(recipe({ gridW: 10, gridH: 10 }), DESKTOP_CAPS)
    expect(out.tiling.nodes.length).toBe(100) // 10×10
  })

  it('honours independent width/height tile counts (a rectangular export grid)', () => {
    const out = computeExport(recipe({ gridW: 10, gridH: 4 }), DESKTOP_CAPS)
    expect(out.tiling.nodes.length).toBe(40) // 10 wide x 4 tall, not 10×10 or 4×4
  })

  it('produces an empty colour map when nothing matches the rules', () => {
    const out = computeExport(recipe({ coloringRules: [] }), DESKTOP_CAPS)
    expect(out.colorFor.size).toBe(0)
  })

  it('seeds walkers from the Initial-state document (no hand seeds) and runs them', () => {
    const out = computeExport(
      recipe({
        seeds: [],
        gridW: 8,
        gridH: 8,
        traversers: [{ id: 't', name: 'edge', text: 'move nearest-unvisited' }],
        initialState: 'auto-place line {t1, 0, 0, 0}', // t1 = the first traverser ("edge") on the top row
      }),
      DESKTOP_CAPS,
    )
    expect(out.hitCap).toBe(false)
    expect(out.ticks).toBeGreaterThan(0)
    expect(out.colorFor.size).toBeGreaterThan(8) // the top-row walkers left trails beyond their start row
  })
})
