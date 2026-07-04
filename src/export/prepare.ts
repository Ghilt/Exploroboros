// Turn a Recipe + an export Tiling into everything the headless run + colorize need — the compiled
// definitions, the predicate maps, the tile index, and the remapped seeds + base overlay. Mirrors the
// assembly in Workspace.tsx (defs / predicateText / predicateNames / indexById) so an export compiles
// IDENTICALLY to the live run. Pure & isomorphic, so it runs in the worker and under Vitest.

import type { Tiling } from '../tiling'
import { nodeById, nearestEdge } from '../tiling'
import type { TileState } from '../canvas'
import { compileProgram, type Program, type Traverser } from '../traverse'
import { applyInitWrites, compileDoc, mergeByTile, resolveInitialState } from '../initstate'
import { BUNDLED_PREDICATES } from '../data/bundledPredicates'
import type { Recipe } from './recipe'
import { placeOffset } from './remap'

// The always-available built-in walker (same as Workspace) — re-injected on every prepare so a recipe
// that uses it works even though it lives in no store.
const BUILTIN_WALKER = 'Walker'
const BUILTIN_WALKER_TEXT = 'move nearest-unvisited'

export type Prepared = {
  defs: Map<string, Program>
  predicateText: Map<string, string>
  indexById: Map<string, number>
  seeds: Traverser[]
  baseOverlay: Map<string, TileState>
}

export function buildIndexById(tiling: Tiling): Map<string, number> {
  const map = new Map<string, number>()
  tiling.nodes.forEach((node, i) => map.set(node.id, i))
  return map
}

// Predicate id -> DSL text (bundled + the recipe's custom predicates) — for colorize's `ref` rules.
export function buildPredicateText(predicates: Recipe['predicates']): Map<string, string> {
  const map = new Map<string, string>()
  for (const b of BUNDLED_PREDICATES) map.set(b.id, b.text)
  for (const p of predicates) map.set(p.id, p.text)
  return map
}

// Predicate NAME -> DSL text — for a traverser guard that references a saved predicate by name.
function buildPredicateNames(predicates: Recipe['predicates']): Map<string, string> {
  const map = new Map<string, string>()
  for (const b of BUNDLED_PREDICATES) map.set(b.name, b.text)
  for (const p of predicates) if (p.name) map.set(p.name, p.text)
  return map
}

// Definition name -> compiled Program (built-in Walker + every recipe traverser that compiles).
export function buildDefs(
  traversers: Recipe['traversers'],
  predicates: Recipe['predicates'],
): Map<string, Program> {
  const names = buildPredicateNames(predicates)
  const defs = new Map<string, Program>()
  const walker = compileProgram(BUILTIN_WALKER_TEXT, names)
  if (walker.ok) defs.set(BUILTIN_WALKER, walker.value)
  for (const t of traversers) {
    const c = compileProgram(t.text, names)
    if (c.ok) defs.set(t.name, c.value)
  }
  return defs
}

// Remap the recipe's portable seeds onto the export tiling. maxSplit/maxSteps/movement are seeded from
// the recipe but get refreshed from the def at run start (runToCompletion.startRun), matching the live
// Play. Seeds whose offset can't be placed are dropped. The recipe stores the seed's aim as an ANGLE
// (tiling-independent); the engine runs on an edge NUMBER, so convert here on the placed tile — the
// edge whose outward normal is closest to the stored angle.
export function remapSeeds(seeds: Recipe['seeds'], tiling: Tiling): Traverser[] {
  const out: Traverser[] = []
  seeds.forEach((s, i) => {
    const tile = placeOffset(tiling, s.offset, s.shape)
    if (!tile) return
    const node = nodeById(tiling, tile)!
    out.push({
      id: `seed${i}`,
      tile,
      heading: nearestEdge(node, s.heading),
      def: s.def,
      steps: 0,
      splits: 0,
      maxSplit: s.maxSplit,
      maxSteps: s.maxSteps,
      movement: s.movement,
      p: s.p,
      q: s.q,
      r: s.r,
    })
  })
  return out
}

// Remap the recipe's hand-paint onto the export tiling. Entries landing on the same tile merge (visit
// lists concatenate, registries add) so nothing is silently lost when the grid is smaller.
export function remapPaint(paint: Recipe['paint'], tiling: Tiling): Map<string, TileState> {
  const overlay = new Map<string, TileState>()
  for (const p of paint) {
    const tile = placeOffset(tiling, p.offset)
    if (!tile) continue
    const prev = overlay.get(tile)
    overlay.set(
      tile,
      prev
        ? { visits: [...prev.visits, ...p.visits], a: prev.a + p.a, b: prev.b + p.b, c: prev.c + p.c }
        : { visits: [...p.visits], a: p.a, b: p.b, c: p.c },
    )
  }
  return overlay
}

export function prepareFromRecipe(recipe: Recipe, tiling: Tiling): Prepared {
  const defs = buildDefs(recipe.traversers, recipe.predicates)
  const indexById = buildIndexById(tiling)
  const handOverlay = remapPaint(recipe.paint, tiling)
  // The Initial-state document, resolved against the EXPORT tiling (grid-relative) — seed walkers +
  // registry/visited set-writes. Mirrors the live Workspace assembly so preview == export: referenced
  // traversers resolve by number (list order) or name; hand-placed seeds win a shared tile; init
  // registry/visited set-writes overwrite hand-paint.
  const order = recipe.traversers.map((t) => t.name)
  const compiled = compileDoc(recipe.initialState ?? '', buildPredicateNames(recipe.predicates))
  const init = compiled.ok
    ? resolveInitialState(compiled.value, tiling, order, defs, handOverlay, indexById)
    : { seeds: [], writes: [] }
  const baseOverlay = applyInitWrites(handOverlay, init.writes)
  const seeds = mergeByTile(remapSeeds(recipe.seeds, tiling), init.seeds)
  return {
    defs,
    predicateText: buildPredicateText(recipe.predicates),
    indexById,
    seeds,
    baseOverlay,
  }
}
