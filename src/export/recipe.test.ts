import { describe, it, expect } from 'vitest'
import { buildTiling, applyPaint, type TileState } from '../canvas'
import type { Traverser } from '../traverse'
import type { ColoringRule } from '../colorizer'
import { buildRecipe, parseRecipe, migrateRecipe, RECIPE_SCHEMA_VERSION, APP_VERSION, type RecipeInput, type Migration } from './recipe'

const tiling = buildTiling('square', 6)

function seed(tile: string): Traverser {
  // heading is an EDGE NUMBER; buildRecipe serialises it as that edge's outward-normal angle.
  return { id: 'w', tile, heading: 1, def: 'Walker', steps: 0, splits: 0, maxSplit: 2, maxSteps: 1234, movement: 'relative', p: 0, q: 0, r: 0 }
}

const rule: ColoringRule = {
  id: 'r1',
  predicate: { kind: 'ref', id: 'visited' },
  color: { kind: 'flat', hex: '#ff0000' },
  opacity: 1,
}

function input(): RecipeInput {
  const base = applyPaint(applyPaint(new Map<string, TileState>(), ['sq:1,1'], 'visited'), ['sq:1,1'], 'a')
  return {
    tilingId: 'square',
    exportGridW: 200,
    exportGridH: 150,
    liveTiling: tiling,
    seeds: [seed('sq:3,3')],
    baseOverlay: base,
    predicates: [{ id: 'p1', name: 'café', text: 'visited > 1', autoName: false }],
    traversers: [{ id: 't1', name: 'spiral', text: 'move turn r1' }],
    coloringRules: [rule],
    initialState: 'auto-place line {t1, 0, 0, 0}',
    numberingScheme: 'left-to-right',
    output: { width: 3200, height: 3200, edges: false, background: null },
  }
}

describe('recipe', () => {
  it('builds a recipe with portable offsets + embedded DSL texts', () => {
    const r = buildRecipe(input())
    expect(r.app).toBe('exploroboros')
    expect(r.tilingId).toBe('square')
    expect(r.gridW).toBe(200)
    expect(r.gridH).toBe(150)
    expect(r.schemaVersion).toBe(RECIPE_SCHEMA_VERSION)
    expect(r.appVersion).toBe(APP_VERSION)
    expect(r.seeds).toHaveLength(1)
    expect(r.seeds[0].shape).toBe('square')
    expect(r.seeds[0].def).toBe('Walker')
    expect(r.seeds[0].maxSteps).toBe(1234)
    // sq:3,3 centroid (3.5,3.5) sits half a tile past the 6×6 grid centre (3,3) → offset (0.5,0.5)
    expect(r.seeds[0].offset.x).toBeCloseTo(0.5)
    expect(r.seeds[0].offset.y).toBeCloseTo(0.5)
    expect(r.paint).toHaveLength(1)
    expect(r.paint[0].a).toBe(1)
    expect(r.predicates[0].text).toBe('visited > 1')
    expect(r.traversers[0].text).toBe('move turn r1')
    expect(r.coloringRules[0]).toMatchObject({ id: 'r1' })
    expect(r.initialState).toBe('auto-place line {t1, 0, 0, 0}')
  })

  it('round-trips through JSON via parseRecipe (incl. Unicode names)', () => {
    const r = buildRecipe(input())
    const res = parseRecipe(JSON.stringify(r))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.recipe).toEqual(r)
    expect(res.migratedFrom).toBeNull()
    expect(res.recipe.predicates[0].name).toBe('café')
  })

  it('classifies garbage / foreign / too-new with a reason', () => {
    expect(parseRecipe('not json')).toEqual({ ok: false, reason: 'malformed' })
    expect(parseRecipe('{"app":"something-else"}')).toEqual({ ok: false, reason: 'foreign' })
    // a NEWER schema than this build → tell the user to update, don't silently misread it
    const newer = parseRecipe(JSON.stringify({ app: 'exploroboros', schemaVersion: RECIPE_SCHEMA_VERSION + 1 }))
    expect(newer).toEqual({ ok: false, reason: 'too-new' })
    // present but structurally broken at the current version
    expect(parseRecipe(JSON.stringify({ app: 'exploroboros', schemaVersion: RECIPE_SCHEMA_VERSION }))).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('drops seeds whose tile id is not on the live tiling', () => {
    const inp = input()
    inp.seeds = [seed('sq:99,99')]
    expect(buildRecipe(inp).seeds).toHaveLength(0)
  })
})

describe('migrateRecipe (the upgrade chain that keeps old images readable)', () => {
  // A synthetic v1→v2→v3 chain (no real migrations exist yet — this proves the framework).
  const chain: Migration[] = [
    { from: 1, migrate: (r) => ({ ...r, addedInV2: true }) },
    { from: 2, migrate: (r) => ({ ...r, addedInV3: 'x' }) },
  ]

  it('runs every step in order and forces schemaVersion forward', () => {
    const out = migrateRecipe({ schemaVersion: 1, keep: 7 }, 3, chain)
    expect(out).toEqual({ schemaVersion: 3, keep: 7, addedInV2: true, addedInV3: 'x' })
  })

  it('is a no-op when already at the target', () => {
    const obj = { schemaVersion: 3, a: 1 }
    expect(migrateRecipe(obj, 3, chain)).toEqual(obj)
  })

  it('migrates partway when the target is mid-chain', () => {
    expect(migrateRecipe({ schemaVersion: 1 }, 2, chain)).toEqual({ schemaVersion: 2, addedInV2: true })
  })

  it('returns null when a step in the path is missing (a chain gap)', () => {
    expect(migrateRecipe({ schemaVersion: 1 }, 3, [{ from: 2, migrate: (r) => r }])).toBeNull()
  })

  it('the real v1→v2 migration maps output.longEdgePx to width × height', () => {
    // Uses the built-in MIGRATIONS (default arg) — the actual upgrade an old saved image goes through.
    const out = migrateRecipe({ schemaVersion: 1, output: { longEdgePx: 1500, edges: true, background: '#000000' } }, 2)
    expect(out).toMatchObject({
      schemaVersion: 2,
      output: { width: 1500, height: 1500, edges: true, background: '#000000' },
    })
  })

  it('the real v2→v3 migration adds an empty initialState (an old image had none)', () => {
    // Target the literal 3 (not RECIPE_SCHEMA_VERSION), so this stays a test of JUST that step as the
    // schema keeps advancing — see the v3→v4 test below for why that distinction matters.
    const out = migrateRecipe({ schemaVersion: 2, output: { width: 100, height: 100, edges: false, background: null } }, 3)
    expect(out).toMatchObject({ schemaVersion: 3, initialState: '' })
  })

  it('the real v3→v4 migration splits gridN into gridW/gridH (an old image was always square)', () => {
    const out = migrateRecipe({ schemaVersion: 3, gridN: 80 }, 4)
    expect(out).toMatchObject({ schemaVersion: 4, gridW: 80, gridH: 80 })
    expect(out).not.toHaveProperty('gridN')
  })

  it('the real v4→v5 migration sanitizes names and renames a seed def in step', () => {
    const out = migrateRecipe(
      {
        schemaVersion: 4,
        predicates: [
          { id: 'p1', name: 'Has A', text: '[A] > 0', autoName: false },
          { id: 'p2', name: 'visited > 0', text: 'visited > 0', autoName: true }, // auto-name: left alone
        ],
        traversers: [{ id: 't1', name: 'My Walker', text: 'move straight' }],
        seeds: [{ def: 'My Walker', offset: { x: 0, y: 0 } }],
      },
      5,
    )
    expect(out).toMatchObject({ schemaVersion: 5 })
    const o = out as { predicates: { name: string }[]; traversers: { name: string }[]; seeds: { def: string }[] }
    expect(o.predicates[0].name).toBe('Has_A')
    expect(o.predicates[1].name).toBe('visited > 0') // auto-named: untouched
    expect(o.traversers[0].name).toBe('My_Walker')
    expect(o.seeds[0].def).toBe('My_Walker') // seed def renamed in step so the walker still resolves
  })

  it('the real v5→v6 migration is additive — it just advances the version (coloring rules unchanged, all enabled)', () => {
    const rules = [{ id: 'r1', predicate: { kind: 'inline', text: 'visited' }, color: { kind: 'flat', hex: '#fff' }, opacity: 1 }]
    const out = migrateRecipe({ schemaVersion: 5, coloringRules: rules }, 6)
    expect(out).toMatchObject({ schemaVersion: 6, coloringRules: rules })
    // No `enabled` field is forced on — absent means enabled, so old rules keep colouring.
    expect((out as { coloringRules: { enabled?: boolean }[] }).coloringRules[0].enabled).toBeUndefined()
  })

  it('the real v6→v7 migration is a no-op — the DSL grew additively, so a v6 program is unchanged', () => {
    // v7 is stamped only so an OLDER build refuses a new-syntax image cleanly; the programs are text and
    // still parse, so the migration leaves everything (including traverser text) alone but for the version.
    const traversers = [{ id: 't1', name: 'W', text: 'move straight' }]
    const out = migrateRecipe({ schemaVersion: 6, traversers }, 7)
    expect(out).toMatchObject({ schemaVersion: 7, traversers })
  })

  it('v7→v8 adds a numbering scheme; v8→v9 maps old names (spiral→radial, else→left-to-right)', () => {
    // v7 predates numbering → gets the reading-order default; the old v8 'spiral' meant concentric rings,
    // which is now 'radial'; the old v8 default 'normal' becomes the geometric 'left-to-right'.
    expect(migrateRecipe({ schemaVersion: 7, tilingId: 'square' }, 8)).toMatchObject({ schemaVersion: 8, numberingScheme: 'left-to-right' })
    expect(migrateRecipe({ schemaVersion: 8, numberingScheme: 'spiral' }, 9)).toMatchObject({ schemaVersion: 9, numberingScheme: 'radial' })
    expect(migrateRecipe({ schemaVersion: 8, numberingScheme: 'normal' }, 9)).toMatchObject({ schemaVersion: 9, numberingScheme: 'left-to-right' })
  })

  it('refuses to open a pre-v10 recipe — the v9→v10 (@→.) migration was intentionally removed', () => {
    // The DSL path separator changed @ → . at v10; the migration that used to bridge v9 recipes was
    // deliberately dropped once the live gallery's stored text had already been rewritten at rest
    // (tools/migrate-paths.mjs, since removed). The chain now has a gap at v9, so ANY recipe below the
    // current version — not just v9 itself — fails to reach v10 and parseRecipe reports 'unsupported'
    // rather than silently trying to compile leftover `@`-syntax DSL text (which no longer lexes). This
    // is an accepted, owner-approved break: a PNG exported before the change no longer reopens.
    expect(migrateRecipe({ schemaVersion: 9 }, 10)).toBeNull()
    expect(parseRecipe(JSON.stringify({ ...buildRecipe(input()), schemaVersion: 9 }))).toEqual({ ok: false, reason: 'unsupported' })
    expect(parseRecipe(JSON.stringify({ ...buildRecipe(input()), schemaVersion: 6 }))).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('v10→v11 is additive — it just advances the version (the `back` edge is new syntax, old text unchanged)', () => {
    // Like v6→v7: a v10 recipe's programs don't use `back`, so they still parse and reproduce unchanged.
    // The bump only stamps a `back`-using image v11 so an older build refuses it cleanly ("update the app").
    const traversers = [{ id: 't1', name: 'W', text: 'move straight' }]
    const out = migrateRecipe({ schemaVersion: 10, traversers }, 11)
    expect(out).toMatchObject({ schemaVersion: 11, traversers })
    // A current v10 recipe now opens (migrates to 11); it's below current so `migratedFrom` is set.
    const res = parseRecipe(JSON.stringify({ ...buildRecipe(input()), schemaVersion: 10 }))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.migratedFrom).toBe(10)
  })

  it('round-trips a spiral / radial recipe through parseRecipe', () => {
    for (const scheme of ['spiral', 'radial'] as const) {
      const res = parseRecipe(JSON.stringify({ ...buildRecipe(input()), numberingScheme: scheme }))
      expect(res.ok).toBe(true)
      if (res.ok) expect(res.recipe.numberingScheme).toBe(scheme)
    }
  })
})
