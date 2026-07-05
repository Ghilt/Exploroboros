import { describe, it, expect, vi, afterEach } from 'vitest'
import { RECIPE_SCHEMA_VERSION } from '../export'
import { fetchRecipe } from './api'

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response
}

describe('fetchRecipe', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('migrates a creation stored under an older schema (pre-dates a later bump) to the current shape', async () => {
    // A row uploaded back when v3 (gridN, no gridW/gridH) was current — the server stores the recipe
    // as-normalised-at-upload-time and never re-migrates it, so this is what an old row's GET returns.
    const stored = {
      app: 'exploroboros',
      schemaVersion: 3,
      tilingId: 'square',
      gridN: 40,
      output: { width: 512, height: 512, edges: false, background: null },
      seeds: [],
      paint: [],
      predicates: [],
      traversers: [],
      coloringRules: [],
      initialState: '',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ recipe: stored })))
    const recipe = await fetchRecipe('abc')
    expect(recipe.schemaVersion).toBe(RECIPE_SCHEMA_VERSION)
    expect(recipe.gridW).toBe(40)
    expect(recipe.gridH).toBe(40)
  })

  it('throws a friendly error when the stored recipe is corrupt rather than handing back a broken object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ recipe: { app: 'exploroboros' } })))
    await expect(fetchRecipe('abc')).rejects.toThrow(/could not be read/i)
  })
})
