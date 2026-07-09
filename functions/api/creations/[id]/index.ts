// GET /api/creations/:id — one creation's list-shaped item (name, message, tiling, image, counts).
// Powers a direct link to a spotlight image: a shared #/gallery/:id may point at a creation that isn't
// on the recipient's current feed page, so the client fetches just that one. Recipe stays out of this
// payload (that's the lazy /recipe route on import) — same lean shape the list returns.

import type { PagesFunction } from '@cloudflare/workers-types'
import { json, mapRow, type CreationRow, type Env } from '../../_lib'

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id)
  const row = await env.DB
    .prepare(
      'SELECT id, name, message, tiling_id, image_key, width, height, upvotes, created_at FROM creations WHERE id = ?',
    )
    .bind(id)
    .first<CreationRow>()
  if (!row) return json(404, { error: 'not_found' })
  return json(200, { item: mapRow(row) })
}
