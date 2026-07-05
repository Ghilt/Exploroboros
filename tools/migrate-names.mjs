// One-time migration of the LIVE gallery: predicate / traverser names may no longer contain spaces (so
// they can be referenced by name in DSL text — `Has_A and Has_C`). This rewrites each creation's stored
// `recipe_json`, replacing illegal characters in names with `_` (matching src/dsl/names.ts sanitizeName)
// and renaming any seed's `def` in step so a placed walker still resolves. Everything else in the recipe
// is preserved byte-for-byte — this touches ONLY the name fields, to keep the blast radius on production
// data minimal. Idempotent: a second run finds nothing to change.
//
//   node tools/migrate-names.mjs            # DRY RUN against --remote (read-only): shows what would change
//   node tools/migrate-names.mjs --apply    # writes the UPDATEs to the REAL Cloudflare D1
//   node tools/migrate-names.mjs --local     # dry-run against the local dev D1 instead
//   node tools/migrate-names.mjs --local --apply
//
// Modelled on tools/seed-local.mjs: wrangler is invoked with an argument ARRAY (execFileSync, no shell),
// and writes go through a temp .sql `--file` (single quotes doubled) so embedded recipe JSON needs no
// shell/`--command` quoting.

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

// MUST match sanitizeName in src/dsl/names.ts — a run of anything but [A-Za-z0-9_-] becomes one `_`.
const sanitizeName = (name) => String(name).replace(/[^A-Za-z0-9_-]+/g, '_')

function wrangler(args) {
  return execFileSync(process.execPath, [WRANGLER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

// Sanitize names in one recipe object. Returns { recipe, changed, notes }. Only name fields change:
//  - traverser.name (all) + any seed.def that referenced the old name (kept in step)
//  - predicate.name, EXCEPT auto-named ones (their name mirrors the DSL text — "visited > 0" — and is
//    display-only, never referenced as an identifier, so leave it).
function migrateRecipeNames(recipe) {
  const notes = []
  let changed = false
  const rename = new Map()

  if (Array.isArray(recipe.traversers)) {
    for (const t of recipe.traversers) {
      if (t && typeof t.name === 'string') {
        const clean = sanitizeName(t.name)
        if (clean !== t.name) {
          rename.set(t.name, clean)
          notes.push(`traverser "${t.name}" → "${clean}"`)
          t.name = clean
          changed = true
        }
      }
    }
  }
  if (Array.isArray(recipe.predicates)) {
    for (const p of recipe.predicates) {
      if (p && !p.autoName && typeof p.name === 'string') {
        const clean = sanitizeName(p.name)
        if (clean !== p.name) {
          notes.push(`predicate "${p.name}" → "${clean}"`)
          p.name = clean
          changed = true
        }
      }
    }
  }
  if (Array.isArray(recipe.seeds)) {
    for (const s of recipe.seeds) {
      if (s && typeof s.def === 'string' && rename.has(s.def)) {
        s.def = rename.get(s.def)
        changed = true
      }
    }
  }
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
  const { changed, notes } = migrateRecipeNames(recipe)
  if (changed) {
    updates.push({ id: row.id, json: JSON.stringify(recipe) })
    console.log(`  • ${row.id}: ${notes.join(', ')}`)
  }
}

if (updates.length === 0) {
  console.log('✓ no names needed migrating — every stored recipe is already clean.')
  process.exit(0)
}

if (!APPLY) {
  console.log(`\n${updates.length} creation(s) would be updated. Re-run with --apply to write the changes.`)
  process.exit(0)
}

const esc = (s) => String(s).replace(/'/g, "''")
const sql = updates.map((u) => `UPDATE creations SET recipe_json='${esc(u.json)}' WHERE id='${esc(u.id)}';`).join('\n')
const dir = mkdtempSync(join(tmpdir(), 'explo-namefix-'))
const sqlPath = join(dir, 'migrate-names.sql')
writeFileSync(sqlPath, sql + '\n')

console.log(`\n• applying ${updates.length} update(s) to D1 (${SCOPE})…`)
wrangler(['d1', 'execute', DB, SCOPE, '--file', sqlPath])
console.log('✓ done. Re-run without --apply to confirm nothing remains.')
