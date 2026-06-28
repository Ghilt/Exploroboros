import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import { parseRecipe, placeOffset, prepareFromRecipe, runToCompletion } from '../export'
import { compileProgram } from '../traverse'
import { parsePredicate } from '../dsl'
import { visitCount } from '../canvas'
import { GALLERY_RECIPES } from './galleryRecipes'

const ENTRIES = Object.entries(GALLERY_RECIPES)
const BUNDLED = new Set(['visited', 'unvisited', 'rule90', 'odd-visits', 'checker', 'has-a', 'has-b', 'has-c', 'triangles', 'squares'])

// Building kalleboda is dense; all recipes share one (tilingId, gridN), so cache it — rebuilding per
// recipe (×23) is what timed the suite out.
const tilingCache = new Map<string, ReturnType<typeof buildTiling>>()
const tilingFor = (tilingId: string, gridN: number) => {
  const key = `${tilingId}:${gridN}`
  let t = tilingCache.get(key)
  if (!t) {
    t = buildTiling(tilingId, gridN)
    tilingCache.set(key, t)
  }
  return t
}

describe('GALLERY_RECIPES (real ported fractals)', () => {
  it('are keyed by .png filename and survive parseRecipe', () => {
    expect(ENTRIES.length).toBeGreaterThan(0)
    for (const [file, r] of ENTRIES) {
      expect(file.endsWith('.webp'), file).toBe(true)
      expect(parseRecipe(JSON.stringify(r)).ok, file).toBe(true)
    }
  })

  it('build their tiling and place every seed', () => {
    for (const [file, r] of ENTRIES) {
      expect(r.seeds.length, file).toBeGreaterThan(0)
      const t = tilingFor(r.tilingId, r.gridN)
      expect(t.nodes.length, file).toBeGreaterThan(0)
      for (const s of r.seeds) expect(placeOffset(t, s.offset, s.shape), `${file} seed`).toBeTruthy()
    }
  })

  it('every traverser compiles and every seed runs a def the recipe carries (or Walker)', () => {
    for (const [file, r] of ENTRIES) {
      for (const tr of r.traversers) {
        expect(compileProgram(tr.text, new Map()).ok, `${file} traverser "${tr.name}"`).toBe(true)
      }
      const defs = new Set(['Walker', ...r.traversers.map((t) => t.name)])
      for (const s of r.seeds) expect(defs.has(s.def), `${file} seed def "${s.def}"`).toBe(true)
    }
  })

  it('coloring rules reference only bundled or recipe-carried predicates, and embedded predicates parse', () => {
    for (const [file, r] of ENTRIES) {
      const own = new Set(r.predicates.map((p) => p.id))
      for (const rule of r.coloringRules) {
        if (rule.predicate.kind === 'ref') {
          expect(BUNDLED.has(rule.predicate.id) || own.has(rule.predicate.id), `${file} ${rule.predicate.id}`).toBe(true)
        }
      }
      for (const p of r.predicates) expect(parsePredicate(p.text).ok, `${file} predicate "${p.name}"`).toBe(true)
    }
  })

  // The real proof a port "does something": run it headlessly to completion (the same tick the live
  // Play uses) and confirm it grows a fractal — many ticks, a meaningful but not total fill. Logs the
  // stats so the grid size can be tuned.
  it('each recipe grows a fractal when run to completion', () => {
    for (const [file, r] of ENTRIES) {
      const t = tilingFor(r.tilingId, r.gridN)
      const prep = prepareFromRecipe(r, t)
      const run = runToCompletion(t, prep.seeds, prep.baseOverlay, prep.defs, prep.indexById, 200_000)
      let visited = 0
      for (const st of run.overlay.values()) if (visitCount(st) > 0) visited += 1
      const pct = ((visited / t.nodes.length) * 100).toFixed(1)
      // eslint-disable-next-line no-console
      console.log(`${file.padEnd(16)} nodes=${t.nodes.length} ticks=${run.ticks} visited=${visited} (${pct}%) hitCap=${run.hitCap}`)
      expect(run.ticks, `${file} should run several ticks`).toBeGreaterThan(5)
      expect(visited, `${file} should visit beyond the seed`).toBeGreaterThan(20)
      expect(visited, `${file} should not flood the whole plane`).toBeLessThan(t.nodes.length)
    }
  })
})
