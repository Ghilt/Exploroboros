// @vitest-environment node
//
// Guard: the upload handler validates recipes with the app's OWN parseRecipe. That pulls the recipe →
// tiling → canvas graph, which MUST stay DOM/Konva-free to bundle + run in the Cloudflare Workers
// runtime. Running this import under the `node` environment (no jsdom `window`/`document`) fails loudly
// if a DOM dependency ever leaks into that graph — the cheap early-warning the plan calls for.

import { describe, it, expect } from 'vitest'
import { parseRecipe } from '../../src/export/recipe'

const validRecipe = {
  app: 'exploroboros',
  schemaVersion: 3,
  tilingId: 'square',
  gridN: 64,
  output: { width: 512, height: 512, edges: false, background: null },
  seeds: [],
  paint: [],
  predicates: [],
  traversers: [],
  coloringRules: [],
  initialState: '',
}

describe('server-side recipe validation', () => {
  it('imports + parses a valid recipe in a DOM-free environment', () => {
    const r = parseRecipe(JSON.stringify(validRecipe))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.recipe.tilingId).toBe('square')
  })

  it('rejects a foreign blob', () => {
    expect(parseRecipe(JSON.stringify({ app: 'something-else' }))).toEqual({ ok: false, reason: 'foreign' })
  })

  it('rejects non-JSON', () => {
    expect(parseRecipe('not json')).toEqual({ ok: false, reason: 'malformed' })
  })
})
