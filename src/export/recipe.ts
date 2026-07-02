// The full "recipe" for a fractal image — everything needed to reproduce it, embedded in the PNG
// metadata so a saved image can later be reopened back into the canvas (the reopen side is a
// fast-follow; this just produces + parses the recipe). Pure & isomorphic.
//
// Positions are stored grid-INDEPENDENTLY as bounds-centre offsets (see remap.ts), so the same recipe
// reproduces at any grid size. Predicate + traverser DSL texts are EMBEDDED inline (not referenced),
// so an imported image works even if the viewer hasn't authored those definitions. The engine + DSL
// are deterministic, so the recipe alone re-runs to the same image — no baked overlay needed.

import type { Vec2, Tiling, ShapeType } from '../tiling'
import { nodeById, edgeNormalAngle } from '../tiling'
import type { TileState } from '../canvas'
import type { Movement, Traverser } from '../traverse'
import type { ColoringRule } from '../colorizer'
import type { StoredPredicate } from '../state/predicateStore'
import type { StoredTraverser } from '../state/traverserStore'
import { boundsCenter, tileOffset } from './remap'

// Versioning, so images stay readable as the app mutates (CLAUDE.md §4.2 / §6):
//   RECIPE_SCHEMA_VERSION — the compatibility key. **Bump it AND add a MIGRATIONS entry** whenever a
//     change means an old recipe must be transformed (a renamed/added field) OR re-interpreted (an
//     engine/DSL behaviour change) to reproduce correctly. parseRecipe migrates an older recipe up to
//     this version, and refuses one that's NEWER than this build (with reason 'too-new' → "update the app").
//   APP_VERSION — a human-readable stamp of the build that made the image, for display + bug tracing
//     only; never branched on. Bump freely.
export const RECIPE_SCHEMA_VERSION = 2
export const APP_VERSION = '0.1.0'
export const RECIPE_KEYWORD = 'exploroboros:recipe'

export type RecipeSeed = {
  offset: Vec2
  // The shape class the walker was placed on — preferred when remapping onto the export grid so a
  // multi-shape tiling keeps the walker on the same kind of tile. Optional (single-shape tilings).
  shape?: ShapeType
  // The walker's aim as an ANGLE (radians, world y-up = a side's outward normal) — tiling-independent
  // and stable across grid sizes. Converted to/from the engine's edge-number heading at the boundary
  // (remapSeeds / buildRecipe), so old recipes keep loading and the on-disk format is unchanged.
  heading: number
  def: string
  maxSplit: number
  maxSteps: number
  movement: Movement
  p: number
  q: number
  r: number
}

export type RecipePaint = { offset: Vec2; visits: number[]; a: number; b: number; c: number }

// The output image is an explicit pixel WIDTH × HEIGHT. The tiling (its own aspect) is fit/centred
// into it, so a mismatched aspect letterboxes onto the background (renderTiling fills the whole canvas
// with it). The number of tiles (detail) is `gridN`, derived in the UI from a "pixels per tile" knob.
export type RecipeOutput = { width: number; height: number; edges: boolean; background: string | null }

export type Recipe = {
  schemaVersion: number
  // Human-readable stamp of the build that produced the image (diagnostics only). Optional on parse so
  // a hand-made or pre-stamp recipe still loads.
  appVersion?: string
  app: 'exploroboros'
  tilingId: string
  // The grid the image was generated at (the export-grid knob — usually larger than the live grid).
  gridN: number
  output: RecipeOutput
  seeds: RecipeSeed[]
  paint: RecipePaint[]
  predicates: StoredPredicate[]
  traversers: StoredTraverser[]
  coloringRules: ColoringRule[]
}

export type RecipeInput = {
  tilingId: string
  exportGridN: number
  // The tiling the seeds/paint were authored on — used to turn their tile ids into portable offsets.
  liveTiling: Tiling
  seeds: ReadonlyArray<Traverser>
  // The hand-authored base only (caller passes clearTraverserVisits(overlay)) — traverser visits are
  // re-derived by re-running, so they're not stored.
  baseOverlay: ReadonlyMap<string, TileState>
  predicates: ReadonlyArray<StoredPredicate>
  traversers: ReadonlyArray<StoredTraverser>
  coloringRules: ReadonlyArray<ColoringRule>
  output: RecipeOutput
}

export function buildRecipe(input: RecipeInput): Recipe {
  const center = boundsCenter(input.liveTiling)
  const seeds: RecipeSeed[] = []
  for (const s of input.seeds) {
    const node = nodeById(input.liveTiling, s.tile)
    if (!node) continue
    seeds.push({
      offset: { x: node.centroid.x - center.x, y: node.centroid.y - center.y },
      shape: node.shape,
      // The engine heading is an edge NUMBER; store the tiling-independent aim ANGLE (its outward
      // normal) so the recipe stays portable and older/hand-made recipes keep loading.
      heading: edgeNormalAngle(node, s.heading),
      def: s.def,
      maxSplit: s.maxSplit,
      maxSteps: s.maxSteps,
      movement: s.movement,
      p: s.p,
      q: s.q,
      r: s.r,
    })
  }

  const paint: RecipePaint[] = []
  for (const [id, st] of input.baseOverlay) {
    if (st.visits.length === 0 && st.a === 0 && st.b === 0 && st.c === 0) continue
    const offset = tileOffset(input.liveTiling, id)
    if (!offset) continue
    paint.push({ offset, visits: [...st.visits], a: st.a, b: st.b, c: st.c })
  }

  return {
    schemaVersion: RECIPE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    app: 'exploroboros',
    tilingId: input.tilingId,
    gridN: input.exportGridN,
    output: input.output,
    seeds,
    paint,
    predicates: input.predicates.map((p) => ({ ...p })),
    traversers: input.traversers.map((t) => ({ ...t })),
    coloringRules: input.coloringRules.map((r) => ({ ...r })),
  }
}

function isVec2(v: unknown): v is Vec2 {
  return !!v && typeof v === 'object' && typeof (v as Vec2).x === 'number' && typeof (v as Vec2).y === 'number'
}

type AnyRecipe = Record<string, unknown>

// One upgrade step, bringing a recipe from schema `from` to `from + 1`. Add one here every time
// RECIPE_SCHEMA_VERSION is bumped, e.g.:
//   { from: 1, migrate: (r) => ({ ...r, somethingNew: defaultValue }) }
// The runner forces schemaVersion forward, so a migration only has to fix the shape/values.
export type Migration = { from: number; migrate: (r: AnyRecipe) => AnyRecipe }

const MIGRATIONS: ReadonlyArray<Migration> = [
  // v1 → v2: the output went from a single `longEdgePx` (aspect derived from the tiling) to an
  // explicit `width` × `height`. Old images were ~square for square-ish tilings, so longEdgePx maps to
  // both dimensions; the tiling is then fit/centred into that square (close to the original framing).
  {
    from: 1,
    migrate: (r) => {
      const out = (r.output ?? {}) as { longEdgePx?: number; edges?: boolean; background?: string | null }
      const edge = typeof out.longEdgePx === 'number' ? out.longEdgePx : 2048
      return { ...r, output: { width: edge, height: edge, edges: !!out.edges, background: out.background ?? null } }
    },
  },
]

// Upgrade `obj` from its own schemaVersion up to `target` by running the migration chain in order.
// Pure; returns the upgraded object, or null if a needed step is missing (a gap in the chain). The
// migrations list is injectable for testing. Each applied step forces schemaVersion to advance by one.
export function migrateRecipe(
  obj: AnyRecipe,
  target: number,
  migrations: ReadonlyArray<Migration> = MIGRATIONS,
): AnyRecipe | null {
  let cur = obj
  let ver = typeof cur.schemaVersion === 'number' ? cur.schemaVersion : 0
  let guard = 0
  while (ver < target) {
    const step = migrations.find((m) => m.from === ver)
    if (!step) return null // no path from this version — caller treats as unsupported
    cur = { ...step.migrate(cur), schemaVersion: ver + 1 }
    ver += 1
    if ((guard += 1) > 1000) return null // defensive against a malformed chain
  }
  return cur
}

export type ParseFailure = 'malformed' | 'foreign' | 'too-new' | 'unsupported'
export type ParseResult =
  | { ok: true; recipe: Recipe; migratedFrom: number | null }
  | { ok: false; reason: ParseFailure }

// Validate the current-schema shape (after any migration). Light per-entry checks on the
// geometry-bearing fields; the DSL/colour data stays opaque.
function isCurrentShape(r: AnyRecipe): boolean {
  if (typeof r.tilingId !== 'string' || typeof r.gridN !== 'number') return false
  if (!Array.isArray(r.seeds) || !Array.isArray(r.paint)) return false
  if (!Array.isArray(r.predicates) || !Array.isArray(r.traversers) || !Array.isArray(r.coloringRules)) return false
  const out = r.output as RecipeOutput | undefined
  if (!out || typeof out.width !== 'number' || typeof out.height !== 'number') return false
  for (const s of r.seeds) if (!isVec2((s as RecipeSeed).offset)) return false
  for (const p of r.paint) if (!isVec2((p as RecipePaint).offset)) return false
  return true
}

// Parse + version-check + migrate a recipe JSON string into the CURRENT shape. Never throws; the
// result says why a stray/foreign/old/new PNG couldn't load:
//   'foreign'  — not an Exploroboros recipe.
//   'malformed'— not JSON, or the wrong shape even after migration.
//   'too-new'  — made by a NEWER build than this one (tell the user to update).
//   'unsupported'— an older schema with no migration path (shouldn't happen once chains are kept).
// `migratedFrom` is the original schemaVersion when an upgrade was applied, else null.
export function parseRecipe(json: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'malformed' }
  const obj = data as AnyRecipe
  if (obj.app !== 'exploroboros') return { ok: false, reason: 'foreign' }
  const v = obj.schemaVersion
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, reason: 'malformed' }
  if (v > RECIPE_SCHEMA_VERSION) return { ok: false, reason: 'too-new' }

  const migrated = v < RECIPE_SCHEMA_VERSION ? migrateRecipe(obj, RECIPE_SCHEMA_VERSION) : obj
  if (!migrated) return { ok: false, reason: 'unsupported' }
  if (!isCurrentShape(migrated)) return { ok: false, reason: 'malformed' }
  return { ok: true, recipe: migrated as unknown as Recipe, migratedFrom: v < RECIPE_SCHEMA_VERSION ? v : null }
}
