import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import { parseRecipe, placeOffset } from '../export'
import { compileProgram } from '../traverse'
import { parsePredicate } from '../dsl'
import { FAKE_RECIPES } from './galleryRecipes'

describe('FAKE_RECIPES (gallery placeholders)', () => {
  it('exist and are all valid recipes (survive parseRecipe)', () => {
    expect(FAKE_RECIPES.length).toBeGreaterThan(0)
    for (const r of FAKE_RECIPES) {
      const res = parseRecipe(JSON.stringify(r))
      expect(res.ok).toBe(true)
    }
  })

  it('build their tiling and place every seed on it', () => {
    for (const r of FAKE_RECIPES) {
      expect(r.seeds.length).toBeGreaterThan(0)
      const t = buildTiling(r.tilingId, 40)
      expect(t.nodes.length).toBeGreaterThan(0)
      for (const s of r.seeds) {
        expect(placeOffset(t, s.offset, s.shape)).toBeTruthy()
      }
    }
  })

  it('only reference predicate ids they carry inline or well-known bundled ones', () => {
    const BUNDLED = new Set(['visited', 'unvisited', 'rule90', 'odd-visits', 'checker', 'has-a', 'has-b', 'has-c', 'triangles'])
    for (const r of FAKE_RECIPES) {
      const own = new Set(r.predicates.map((p) => p.id))
      for (const rule of r.coloringRules) {
        if (rule.predicate.kind === 'ref') {
          expect(BUNDLED.has(rule.predicate.id) || own.has(rule.predicate.id)).toBe(true)
        }
      }
    }
  })

  it('every embedded traverser program compiles (so opening one populates the pane with valid defs)', () => {
    for (const r of FAKE_RECIPES) {
      for (const t of r.traversers) {
        const c = compileProgram(t.text, new Map())
        expect(c.ok, `traverser "${t.name}": ${t.text}`).toBe(true)
      }
    }
  })

  it('every embedded predicate parses', () => {
    for (const r of FAKE_RECIPES) {
      for (const p of r.predicates) {
        expect(parsePredicate(p.text).ok, `predicate "${p.name}": ${p.text}`).toBe(true)
      }
    }
  })

  it('each seed runs the built-in Walker or a traverser the recipe carries', () => {
    for (const r of FAKE_RECIPES) {
      const defs = new Set(['Walker', ...r.traversers.map((t) => t.name)])
      for (const s of r.seeds) expect(defs.has(s.def), `seed def "${s.def}" on ${r.tilingId}`).toBe(true)
    }
  })
})
