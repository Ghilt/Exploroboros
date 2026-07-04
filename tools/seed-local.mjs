// Seed the LOCAL dev database + image bucket with sample creations, so the gallery isn't empty while
// developing. Idempotent: applies the local migration, then inserts the samples ONLY if the local
// gallery is currently empty. Writes to the same local (Miniflare) D1 + R2 that `wrangler pages dev`
// reads. Run standalone via `npm run seed:local`, or automatically by `npm run dev:local` BEFORE the dev
// server starts (so there is no file-lock conflict with a running server).
//
// wrangler is invoked with an argument ARRAY (execFileSync, no shell), so the SQL — parentheses, quotes,
// embedded recipe JSON — is passed verbatim without any Windows cmd quoting hazards.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WRANGLER = 'node_modules/wrangler/bin/wrangler.js'
const DB = 'exploroboros'
const BUCKET = 'exploroboros-images'

function wrangler(args, { quiet = false } = {}) {
  return execFileSync(process.execPath, [WRANGLER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
}

console.log('• applying local migrations…')
wrangler(['d1', 'migrations', 'apply', DB, '--local'], { quiet: true })

let count = 0
try {
  const out = wrangler(['d1', 'execute', DB, '--local', '--json', '--command', 'SELECT COUNT(*) AS n FROM creations'], { quiet: true })
  count = JSON.parse(out)?.[0]?.results?.[0]?.n ?? 0
} catch (e) {
  console.error('  (could not read the row count — assuming empty)', e.message)
}

if (count > 0) {
  console.log(`✓ local gallery already has ${count} creation(s) — nothing to seed.`)
  process.exit(0)
}

console.log('• seeding sample creations into the local gallery…')
const samples = JSON.parse(readFileSync('tools/sample-creations.json', 'utf8'))
const esc = (s) => String(s).replace(/'/g, "''")
const now = Date.now()
const rows = []
const images = []
samples.forEach((s, i) => {
  const id = randomUUID()
  const createdAt = now - i * 60000 // stagger so "newest" has a stable order
  const votes = (i * 7 + 3) % 23 // deterministic variety for sort-by-top
  rows.push(
    `INSERT INTO creations (id,name,message,tiling_id,recipe_json,image_key,width,height,upvotes,created_at) VALUES ('${id}','${esc(s.name)}','${esc(s.message)}','${esc(s.tilingId)}','${esc(JSON.stringify(s.recipe))}','img/${id}.webp',${s.width || 1200},${s.height || 1200},${votes},${createdAt});`,
  )
  images.push({ id, file: s.file })
})

const dir = mkdtempSync(join(tmpdir(), 'explo-seed-'))
const sqlPath = join(dir, 'seed.sql')
writeFileSync(sqlPath, rows.join('\n') + '\n')
wrangler(['d1', 'execute', DB, '--local', '--file', sqlPath], { quiet: true })

for (const { id, file } of images) {
  wrangler(['r2', 'object', 'put', `${BUCKET}/img/${id}.webp`, '--file', `src/assets/gallery/${file}`, '--local', '--ct', 'image/webp'], { quiet: true })
}

console.log(`✓ seeded ${samples.length} sample creations into the local gallery.`)
