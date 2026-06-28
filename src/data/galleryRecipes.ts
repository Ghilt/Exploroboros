// Placeholder "recipes" attached to the gallery images so clicking one opens a real, ready-to-run
// setup in the canvas — now WITH traverser definitions + named predicates, so the Traversers and
// Predicates panes populate on open (not just Coloring). These are FAKE (they don't reproduce the
// actual showcase pictures), varied tilings + rules + walkers, just enough to demonstrate
// reopen-from-PNG. When real saved creations exist this list goes away (recipes ride in PNG metadata).

import { RECIPE_SCHEMA_VERSION, APP_VERSION, type Recipe, type RecipeSeed } from '../export'
import type { ColoringRule } from '../colorizer'
import type { StoredPredicate } from '../state/predicateStore'
import type { StoredTraverser } from '../state/traverserStore'

// Reusable placeholder traverser definitions. Programs are built from the DSL grammar that
// serialize.test.ts proves valid (`move nearest-unvisited`, `move [r1, l1]`, `put A = …`); a test
// compiles each so a typo can't ship.
const WANDERER: StoredTraverser = { id: 'gt-wanderer', name: 'wanderer', text: 'move nearest-unvisited' }
const TWIN: StoredTraverser = { id: 'gt-twin', name: 'twin', text: 'max-split = 2\nmove [r1, l1]' }
const CARVER: StoredTraverser = { id: 'gt-carver', name: 'carver', text: 'put A = visited + 1\nmove nearest-unvisited' }

// Named predicates used by some recipes' coloring (loaded into the Predicate pane on open).
const BUSY: StoredPredicate = { id: 'gp-busy', name: 'busy', text: 'visited > 2', autoName: false }
const A_RICH: StoredPredicate = { id: 'gp-a-rich', name: 'a-rich', text: '[A] > 1', autoName: false }

// A walker at a world offset from the tiling centre (the portable form recipes store), running `def`.
const seed = (x: number, y: number, def: string, heading = 0): RecipeSeed => ({
  offset: { x, y },
  heading,
  def,
  maxSplit: 1,
  maxSteps: 50000,
  movement: 'relative',
  p: 0,
  q: 0,
  r: 0,
})

// A flat-colour rule referencing a predicate by id (bundled ids like 'visited'/'rule90', or a custom
// one carried in the recipe's `predicates`).
const flat = (id: string, predId: string, hex: string): ColoringRule => ({
  id,
  predicate: { kind: 'ref', id: predId },
  color: { kind: 'flat', hex },
  opacity: 1,
})

const recipe = (
  tilingId: string,
  gridN: number,
  seeds: RecipeSeed[],
  coloringRules: ColoringRule[],
  traversers: StoredTraverser[] = [],
  predicates: StoredPredicate[] = [],
): Recipe => ({
  schemaVersion: RECIPE_SCHEMA_VERSION,
  appVersion: APP_VERSION,
  app: 'exploroboros',
  tilingId,
  gridN,
  output: { longEdgePx: 2048, edges: false, background: '#ffffff' },
  seeds,
  paint: [],
  predicates,
  traversers,
  coloringRules,
})

export const FAKE_RECIPES: ReadonlyArray<Recipe> = [
  recipe('square', 96, [seed(0, 0, 'wanderer')], [flat('sq-v', 'visited', '#f4d35e'), flat('sq-g', 'rule90', '#ee4266')], [WANDERER]),
  recipe('hexagonal', 84, [seed(0, 0, 'twin')], [flat('hx-v', 'visited', '#7b2cbf'), flat('hx-g', 'rule90', '#ffd166')], [TWIN]),
  recipe(
    'triangular',
    96,
    [seed(0, 0, 'wanderer'), seed(5, 0, 'twin', Math.PI)],
    [flat('tr-v', 'visited', '#2a9d8f'), flat('tr-o', 'odd-visits', '#264653')],
    [WANDERER, TWIN],
  ),
  recipe(
    'truncated-square',
    76,
    [seed(0, 0, 'carver')],
    [flat('ts-v', 'visited', '#ef476f'), flat('ts-a', 'gp-a-rich', '#073b4c')],
    [CARVER],
    [A_RICH],
  ),
  recipe(
    'trihexagonal',
    80,
    [seed(0, 0, 'wanderer')],
    [flat('th-v', 'visited', '#118ab2'), flat('th-b', 'gp-busy', '#073b4c')],
    [WANDERER],
    [BUSY],
  ),
  recipe('rhombitrihexagonal', 70, [seed(0, 0, 'twin')], [flat('rh-v', 'visited', '#e76f51'), flat('rh-g', 'rule90', '#1d3557')], [TWIN]),
]
