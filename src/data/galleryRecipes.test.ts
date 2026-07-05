import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import { parseRecipe, placeOffset, prepareFromRecipe, runToCompletion } from '../export'
import { compileProgram } from '../traverse'
import { parsePredicate } from '../dsl'
import { visitCount } from '../canvas'
import { colorize } from '../colorizer'
import { GALLERY_RECIPES } from './galleryRecipes'

const ENTRIES = Object.entries(GALLERY_RECIPES)
const BUNDLED = new Set(['visited', 'visited-neighbor', 'unvisited', 'unvisited-neighbor', 'has-a', 'has-b', 'has-c'])
// Cap the run grid: a recipe's export gridW/gridH can be huge (e.g. the full-plane XOR CA at 1067²),
// which would make the grow-check crawl. The fractal's structure is the same at a modest size —
// initialState seeding is grid-relative, and centre-seeded recipes still grow from the middle.
const RUN_GRID_CAP = 120

// Building kalleboda is dense; all recipes share one (tilingId, gridW, gridH), so cache it — rebuilding
// per recipe (×23) is what timed the suite out.
const tilingCache = new Map<string, ReturnType<typeof buildTiling>>()
const tilingFor = (tilingId: string, gridW: number, gridH: number) => {
  const key = `${tilingId}:${gridW}x${gridH}`
  let t = tilingCache.get(key)
  if (!t) {
    t = buildTiling(tilingId, gridW, gridH)
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
      // A recipe seeds its walkers by hand (r.seeds) OR by the Initial-state document (r.initialState).
      expect(r.seeds.length > 0 || r.initialState.trim().length > 0, `${file} places no walkers`).toBe(true)
      const t = tilingFor(r.tilingId, Math.min(r.gridW, RUN_GRID_CAP), Math.min(r.gridH, RUN_GRID_CAP))
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
      const t = tilingFor(r.tilingId, Math.min(r.gridW, RUN_GRID_CAP), Math.min(r.gridH, RUN_GRID_CAP))
      const prep = prepareFromRecipe(r, t)
      const run = runToCompletion(t, prep.seeds, prep.baseOverlay, prep.defs, prep.indexById, 200_000)
      let visited = 0
      for (const st of run.overlay.values()) if (visitCount(st) > 0) visited += 1
      // The VISUAL fractal is the COLOURING, not the visited set — a full-plane XOR cellular automaton
      // sweeps every tile (100% visited) yet paints only a diamond. Measure the coloured tiles instead;
      // it must be non-empty. No upper bound: a CA sweep and shape-based rules both legitimately touch
      // every tile.
      const colored = colorize(r.coloringRules, prep.predicateText, prep.predicateNames, t, run.overlay, prep.indexById)
      const pct = ((visited / t.nodes.length) * 100).toFixed(1)
      // eslint-disable-next-line no-console
      console.log(`${file.padEnd(16)} nodes=${t.nodes.length} ticks=${run.ticks} visited=${visited} (${pct}%) coloured=${colored.size} hitCap=${run.hitCap}`)
      expect(run.ticks, `${file} should run several ticks`).toBeGreaterThan(5)
      expect(visited, `${file} should visit beyond the seed`).toBeGreaterThan(20)
      expect(colored.size, `${file} should colour a visible fractal`).toBeGreaterThan(20)
    }
  })
})
