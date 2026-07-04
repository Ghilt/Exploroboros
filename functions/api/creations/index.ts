// GET  /api/creations  — list / search / sort / filter, keyset-paginated for infinite scroll.
// POST /api/creations  — upload a creation (compact WebP + recipe), gated by the global 10/day cap.
//
// Imports the app's OWN pure recipe validator + tiling allow-list (both DOM-free → run in Workers).
// Import them from their specific modules (not the src/export barrel) so the Function bundle stays lean.

import type { PagesFunction } from '@cloudflare/workers-types'
import { parseRecipe } from '../../../src/export/recipe'
import { getTiling } from '../../../src/data/tilings'
import {
  buildListQuery,
  cursorFromItem,
  decodeCursor,
  encodeCursor,
  isWebp,
  json,
  mapRow,
  parseSort,
  startOfUtcDayMs,
  DAILY_CAP,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE,
  MAX_NAME,
  MAX_RECIPE_BYTES,
  PAGE_DEFAULT,
  PAGE_MAX,
  type CreationRow,
  type Env,
} from '../_lib'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const sort = parseSort(url.searchParams.get('sort'))
  const tilingRaw = url.searchParams.get('tiling')
  const tiling = tilingRaw && getTiling(tilingRaw) ? tilingRaw : null // ignore an unknown tiling filter
  const q = url.searchParams.get('q')
  const cursor = decodeCursor(url.searchParams.get('cursor'))
  const limRaw = parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(limRaw) ? Math.min(PAGE_MAX, Math.max(1, limRaw)) : PAGE_DEFAULT

  const { sql, params } = buildListQuery({ sort, tiling, q, cursor, limit })
  const res = await env.DB.prepare(sql).bind(...params).all<CreationRow>()
  const rows = res.results ?? []
  const hasMore = rows.length > limit
  const items = (hasMore ? rows.slice(0, limit) : rows).map(mapRow)
  const nextCursor = hasMore && items.length ? encodeCursor(cursorFromItem(items[items.length - 1])) : null
  return json(200, { items, nextCursor })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // (1) Global daily cap — server-enforced. A race at exactly the cap is acceptable (worst case a few
  // extra rows), so a plain COUNT-then-INSERT needs no lock.
  const startDay = startOfUtcDayMs(Date.now())
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS c FROM creations WHERE created_at >= ?')
    .bind(startDay)
    .first<{ c: number }>()
  if ((countRow?.c ?? 0) >= DAILY_CAP) {
    return json(429, { error: 'daily_cap', message: `The gallery is full for today (${DAILY_CAP}/day). Try again tomorrow.` })
  }

  // (2) Parse the multipart body.
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json(400, { error: 'bad_form' })
  }
  const name = String(form.get('name') ?? '').trim()
  const message = String(form.get('message') ?? '').trim()
  const recipeText = String(form.get('recipe') ?? '')
  const image = form.get('image')
  const width = parseInt(String(form.get('width') ?? ''), 10)
  const height = parseInt(String(form.get('height') ?? ''), 10)

  // (3) Validate fields (no auth → the server is the only gate).
  if (name.length < 1 || name.length > MAX_NAME) return json(400, { error: 'bad_name' })
  if (message.length > MAX_MESSAGE) return json(400, { error: 'bad_message' })
  if (!recipeText || recipeText.length > MAX_RECIPE_BYTES) return json(400, { error: 'bad_recipe_size' })
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 8192 || height > 8192) {
    return json(400, { error: 'bad_dimensions' })
  }
  if (!(image instanceof File)) return json(400, { error: 'no_image' })
  if (image.size > MAX_IMAGE_BYTES) return json(413, { error: 'image_too_large' })
  const buf = new Uint8Array(await image.arrayBuffer())
  if (!isWebp(buf)) return json(400, { error: 'not_webp' })

  // (4) Recipe gate — the app's own parser. Rejects anything not a valid Exploroboros recipe.
  const parsed = parseRecipe(recipeText)
  if (!parsed.ok) return json(400, { error: 'bad_recipe', reason: parsed.reason })
  const tilingId = parsed.recipe.tilingId
  if (!getTiling(tilingId)) return json(400, { error: 'unknown_tiling' })

  // (5) Mint id + keys.
  const id = crypto.randomUUID()
  const imageKey = `img/${id}.webp`
  const createdAt = Date.now()

  // (6) R2 put FIRST — a stray blob is harmless; a row without a blob would 404.
  await env.BUCKET.put(imageKey, buf, {
    httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
  })

  // (7) Insert the row, storing the NORMALISED recipe (what parseRecipe produced), not the raw text.
  await env.DB
    .prepare(
      'INSERT INTO creations (id, name, message, tiling_id, recipe_json, image_key, width, height, upvotes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
    )
    .bind(id, name, message, tilingId, JSON.stringify(parsed.recipe), imageKey, width, height, createdAt)
    .run()

  return json(201, { id, imageUrl: `/api/img/${id}.webp` })
}
