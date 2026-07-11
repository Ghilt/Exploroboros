// One-time migration of the LIVE gallery: the DSL path separator changed from `@` to `.` (`visited@e1`
// → `visited.e1`, `move e0@e4` → `move e0.e4`, `@tile N` → `.tile N`, `exists@f0` → `exists.f0`). This
// rewrites each creation's stored `recipe_json`, replacing `@` with `.` in the DSL-bearing TEXT fields
// only (traverser/predicate text, inline coloring predicates, the initial-state document). `@` was ONLY
// ever the path operator in DSL text — names can't contain it, and the creation's title/message live in
// separate columns, not the recipe — so a per-field `@`→`.` rewrite is exact and everything else is
// preserved byte-for-byte. Idempotent: a second run finds nothing.
//
// The rewrite matches src/export/recipe.ts's v9→v10 migration (rewritePathsV10) but deliberately does NOT
// touch `schemaVersion`: stored rows span a range of versions (the gallery filled across several schema
// bumps), so this leaves each row's version alone and lets the on-read `parseRecipe` migrate it (v3→…→v10)
// uniformly — its v9→v10 step then no-ops because the text is already `.`. Correctness of the gallery does
// NOT depend on running this at all: a v10 client migrates a stored `@` row on read (fetchRecipe →
// parseRecipe). This tool just rewrites the data at rest so the stored JSON stops carrying the old `@`.
//
// IMPORTANT ordering: run the `--apply --remote` step only AFTER the v10 frontend is deployed — `.`-syntax
// DSL text can't be parsed by an older `@`-based build, so rewriting production data first would break any
// still-deployed old client. Local dev is already v10, so `--local` is safe any time.
//
//   node tools/migrate-paths.mjs            # DRY RUN against --remote (read-only): shows what would change
//   node tools/migrate-paths.mjs --apply    # writes the UPDATEs to the REAL Cloudflare D1
//   node tools/migrate-paths.mjs --local     # dry-run against the local dev D1 instead
//   node tools/migrate-paths.mjs --local --apply
//
// Modelled on tools/migrate-names.mjs: wrangler is invoked with an argument ARRAY (execFileSync, no
// shell), and writes go through a temp .sql `--file` (single quotes doubled) so embedded recipe JSON
// needs no shell/`--command` quoting.

import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

// Find wrangler's bin by walking up from this file for `node_modules/wrangler/bin/wrangler.js`, so this
// runs from the main checkout OR a git worktree (whose node_modules is the main repo's, up the tree).
// Override with WRANGLER_BIN if needed.
function findWrangler() {
  if (process.env.WRANGLER_BIN) return process.env.WRANGLER_BIN
  let dir = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  for (let i = 0; i < 12; i += 1) {
    const cand = join(dir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
    if (existsSync(cand)) return cand
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return 'node_modules/wrangler/bin/wrangler.js' // last resort: relative to cwd
}

const WRANGLER = findWrangler()
const DB = 'exploroboros'

const APPLY = process.argv.includes('--apply')
const SCOPE = process.argv.includes('--local') ? '--local' : '--remote'

function wrangler(args) {
  return execFileSync(process.execPath, [WRANGLER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

// Rewrite the DSL path separator @ → . in one recipe object. Returns { recipe, changed, notes }. Only
// the DSL-bearing TEXT fields change (mirrors src/export/recipe.ts rewritePathsV10):
//  - traverser.text + predicate.text (all)
//  - coloringRules[].predicate.text — INLINE predicates only (a `ref` names a stored predicate by id)
//  - initialState (the auto-place document)
// A field with no `@` is left untouched; `schemaVersion` is left as-is (on-read parseRecipe migrates it).
function migrateRecipePaths(recipe) {
  const notes = []
  let changed = false
  const swap = (label, s) => {
    if (typeof s !== 'string' || !s.includes('@')) return s
    changed = true
    notes.push(label)
    return s.replace(/@/g, '.')
  }

  if (Array.isArray(recipe.traversers)) {
    for (const t of recipe.traversers) {
      if (t && typeof t.text === 'string') t.text = swap(`traverser "${t.name ?? t.id}"`, t.text)
    }
  }
  if (Array.isArray(recipe.predicates)) {
    for (const p of recipe.predicates) {
      if (p && typeof p.text === 'string') p.text = swap(`predicate "${p.name ?? p.id}"`, p.text)
    }
  }
  if (Array.isArray(recipe.coloringRules)) {
    for (const rule of recipe.coloringRules) {
      const pr = rule && rule.predicate
      if (pr && pr.kind === 'inline' && typeof pr.text === 'string') pr.text = swap('inline coloring predicate', pr.text)
    }
  }
  if (typeof recipe.initialState === 'string') recipe.initialState = swap('initial-state', recipe.initialState)

  return { recipe, changed, notes }
}

console.log(`• reading creations from D1 (${SCOPE})…`)
let rows
try {
  const out = wrangler(['d1', 'execute', DB, SCOPE, '--json', '--command', 'SELECT id, recipe_json FROM creations'])
  rows = JSON.parse(out)?.[0]?.results ?? []
} catch (e) {
  console.error('✗ could not read the database. Is wrangler authenticated? Run `wrangler login`.\n', e.message)
  process.exit(1)
}
console.log(`  found ${rows.length} creation(s).`)

const updates = []
for (const row of rows) {
  let recipe
  try {
    recipe = JSON.parse(row.recipe_json)
  } catch {
    console.warn(`  ! skipping ${row.id}: recipe_json is not valid JSON`)
    continue
  }
  const { changed, notes } = migrateRecipePaths(recipe)
  if (changed) {
    updates.push({ id: row.id, json: JSON.stringify(recipe) })
    console.log(`  • ${row.id}: ${notes.join(', ')}`)
  }
}

if (updates.length === 0) {
  console.log('✓ no recipes needed migrating — every stored recipe already uses `.` paths.')
  process.exit(0)
}

if (!APPLY) {
  console.log(`\n${updates.length} creation(s) would be updated. Re-run with --apply to write the changes.`)
  process.exit(0)
}

const esc = (s) => String(s).replace(/'/g, "''")
const sql = updates.map((u) => `UPDATE creations SET recipe_json='${esc(u.json)}' WHERE id='${esc(u.id)}';`).join('\n')
const dir = mkdtempSync(join(tmpdir(), 'explo-pathfix-'))
const sqlPath = join(dir, 'migrate-paths.sql')
writeFileSync(sqlPath, sql + '\n')

console.log(`\n• applying ${updates.length} update(s) to D1 (${SCOPE})…`)
wrangler(['d1', 'execute', DB, SCOPE, '--file', sqlPath])
console.log('✓ done. Re-run without --apply to confirm nothing remains.')
