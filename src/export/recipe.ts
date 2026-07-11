// The full "recipe" for a fractal image — everything needed to reproduce it, embedded in the PNG
// metadata so a saved image can later be reopened back into the canvas (the reopen side is a
// fast-follow; this just produces + parses the recipe). Pure & isomorphic.
//
// Positions are stored grid-INDEPENDENTLY as bounds-centre offsets (see remap.ts), so the same recipe
// reproduces at any grid size. Predicate + traverser DSL texts are EMBEDDED inline (not referenced),
// so an imported image works even if the viewer hasn't authored those definitions. The engine + DSL
// are deterministic, so the recipe alone re-runs to the same image — no baked overlay needed.

import type { Vec2, Tiling, ShapeType, NumberingScheme } from '../tiling'
import { nodeById, edgeNormalAngle } from '../tiling'
import type { TileState } from '../canvas'
import type { Movement, Traverser } from '../traverse'
import type { ColoringRule } from '../colorizer'
import { sanitizeName } from '../dsl/names' // zero-dep, so the Cloudflare Functions bundle stays lean
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
export const RECIPE_SCHEMA_VERSION = 10
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
// with it). The number of tiles (detail) is `gridW`/`gridH`, tied to a "pixels per tile" knob in the UI.
export type RecipeOutput = { width: number; height: number; edges: boolean; background: string | null }

export type Recipe = {
  schemaVersion: number
  // Human-readable stamp of the build that produced the image (diagnostics only). Optional on parse so
  // a hand-made or pre-stamp recipe still loads.
  appVersion?: string
  app: 'exploroboros'
  tilingId: string
  // The grid the image was generated at (the export-grid knobs — usually larger than the live grid).
  // Independent so e.g. the square tiling can export a genuinely rectangular/uneven grid; tilings whose
  // generator only takes one count (buildTiling) average the two.
  gridW: number
  gridH: number
  output: RecipeOutput
  seeds: RecipeSeed[]
  paint: RecipePaint[]
  predicates: StoredPredicate[]
  traversers: StoredTraverser[]
  coloringRules: ColoringRule[]
  // The Initial-state DSL document (the `auto-place` lines) — seeds traversers + registries + visited by
  // grid-relative rules, resolved against the export grid on reopen. Empty string = none. (schema v3)
  initialState: string
  // The board numbering scheme (schema v8; values revised in v9) — the user-facing tile number, so an
  // image that uses `tile-number` / `.tile N` / find-lowest/highest reproduces the same tiles.
  // 'left-to-right' | 'spiral' | 'radial' (see src/tiling/numbering.ts).
  numberingScheme: NumberingScheme
}

export type RecipeInput = {
  tilingId: string
  exportGridW: number
  exportGridH: number
  // The tiling the seeds/paint were authored on — used to turn their tile ids into portable offsets.
  liveTiling: Tiling
  seeds: ReadonlyArray<Traverser>
  // The hand-authored base only (caller passes clearTraverserVisits(overlay)) — traverser visits are
  // re-derived by re-running, so they're not stored.
  baseOverlay: ReadonlyMap<string, TileState>
  predicates: ReadonlyArray<StoredPredicate>
  traversers: ReadonlyArray<StoredTraverser>
  coloringRules: ReadonlyArray<ColoringRule>
  initialState: string
  numberingScheme: NumberingScheme
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
    gridW: input.exportGridW,
    gridH: input.exportGridH,
    output: input.output,
    seeds,
    paint,
    predicates: input.predicates.map((p) => ({ ...p })),
    traversers: input.traversers.map((t) => ({ ...t })),
    coloringRules: input.coloringRules.map((r) => ({ ...r })),
    initialState: input.initialState,
    numberingScheme: input.numberingScheme,
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
  // v2 → v3: the Initial-state DSL (auto-place lines) moved OUT of the traverser text into its own
  // document. Older images have none, so default it to empty — their traversers still carry their
  // behaviour (any old auto-place lines that lived inside a traverser simply no longer compile).
  {
    from: 2,
    migrate: (r) => ({ ...r, initialState: '' }),
  },
  // v3 → v4: the single `gridN` (a square export grid) split into independent `gridW`/`gridH`, so the
  // square tiling can reproduce a rectangular/uneven grid. An old recipe was always generated square,
  // so both axes take its one value.
  {
    from: 3,
    migrate: (r) => {
      const { gridN, ...rest } = r as AnyRecipe & { gridN?: number }
      const n = typeof gridN === 'number' ? gridN : 2
      return { ...rest, gridW: n, gridH: n }
    },
  },
  // v4 → v5: predicate / traverser names may no longer contain spaces (so they can be referenced by
  // name in DSL text — `Has_A and Has_C`). Sanitize every stored name (spaces → `_`), and rename any
  // seed's `def` in step so a placed walker still finds its (renamed) traverser. Old references in DSL
  // TEXT (guards/initstate) with spaces never parsed anyway, so nothing referenceable breaks; a clean
  // name is unchanged (sanitize is a no-op). Purely cosmetic for the rendered image — names map to ids.
  {
    from: 4,
    migrate: migrateNamesV5,
  },
  // v5 → v6: coloring rules gained an optional `enabled` flag (the eye toggle). It's ADDITIVE and
  // defaults to enabled when absent, so an old recipe's rules already reproduce unchanged (all on) —
  // this step only advances the version so a v6 build accepts a v5 image (and refuses a >v6 one).
  {
    from: 5,
    migrate: (r) => r,
  },
  // v6 → v7: the traverser DSL grew `.`-chained moves, bare `A`/`B`/`C` registries, `if { … }` blocks,
  // and `find-tile` search (`fN`). These are ADDITIVE / relaxing, so a v6 recipe's programs still parse
  // and reproduce unchanged — the bump exists only so a recipe that USES the new syntax is stamped v7,
  // and an older build (which can't understand it) refuses it cleanly ("update the app") instead of
  // silently failing to compile the traverser. No shape change, so the step is a no-op.
  {
    from: 6,
    migrate: (r) => r,
  },
  // v7 → v8: a board numbering scheme was added (what find-lowest/highest-tile searches by). Old images
  // predate those constructs, so the generation-order default reproduces them unchanged. The bump also
  // stamps any image that USES find-lowest/highest so an older build refuses it cleanly ("update the app").
  {
    from: 7,
    migrate: (r) => ({ ...r, numberingScheme: 'left-to-right' }),
  },
  // v8 → v9: the numbering scheme names/meanings changed. The old 'spiral' was actually concentric rings,
  // now called 'radial'; the old default 'normal' (generation order) became the geometric 'left-to-right'
  // reading order; the name 'spiral' now means a true winding spiral (no old recipe used it). Map the old
  // values to their equivalents so a v8 image reproduces the SAME numbering it recorded.
  {
    from: 8,
    migrate: (r) => ({ ...r, numberingScheme: r.numberingScheme === 'spiral' ? 'radial' : 'left-to-right' }),
  },
  // v9 → v10 (the DSL path separator changed `@` to `.`) is DELIBERATELY NOT bridged — the owner chose to
  // drop the migration after the one-time production rewrite (`tools/migrate-paths.mjs`, since removed)
  // had already fixed the live gallery's stored text. A v9-or-older recipe now hits this gap and
  // `migrateRecipe` returns null, so `parseRecipe` reports `'unsupported'` instead of silently trying to
  // compile `@`-syntax DSL text (which no longer lexes). This intentionally breaks reopening any
  // already-exported PNG from before the change — see recipe.test.ts's "refuses" case for the accepted
  // failure mode. Do not "fix" this gap without checking with the owner first.
]

function migrateNamesV5(r: AnyRecipe): AnyRecipe {
  const rename = new Map<string, string>() // old traverser name -> sanitized
  const traversers = Array.isArray(r.traversers)
    ? r.traversers.map((t) => {
        const tr = t as { name?: unknown }
        if (typeof tr.name !== 'string') return t
        const clean = sanitizeName(tr.name)
        if (clean !== tr.name) rename.set(tr.name, clean)
        return { ...tr, name: clean }
      })
    : r.traversers
  const predicates = Array.isArray(r.predicates)
    ? r.predicates.map((p) => {
        const pr = p as { name?: unknown; autoName?: unknown }
        // AUTO names mirror the DSL text ("visited > 0") — display-only, never referenced, so leave them.
        if (pr.autoName || typeof pr.name !== 'string') return p
        return { ...pr, name: sanitizeName(pr.name) }
      })
    : r.predicates
  const seeds = Array.isArray(r.seeds)
    ? r.seeds.map((s) => {
        const sd = s as { def?: unknown }
        return typeof sd.def === 'string' && rename.has(sd.def) ? { ...sd, def: rename.get(sd.def) } : s
      })
    : r.seeds
  return { ...r, traversers, predicates, seeds }
}

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
  if (typeof r.tilingId !== 'string' || typeof r.gridW !== 'number' || typeof r.gridH !== 'number') return false
  if (!Array.isArray(r.seeds) || !Array.isArray(r.paint)) return false
  if (!Array.isArray(r.predicates) || !Array.isArray(r.traversers) || !Array.isArray(r.coloringRules)) return false
  if (typeof r.initialState !== 'string') return false
  // numberingScheme is guaranteed by migration/build; tolerate a hand-made recipe that omits it (defaults
  // to 'left-to-right' downstream) but reject a bogus value.
  if (r.numberingScheme !== undefined && !['left-to-right', 'spiral', 'radial'].includes(r.numberingScheme as string)) return false
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
