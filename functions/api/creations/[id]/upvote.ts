// POST /api/creations/:id/upvote — atomic increment (single UPDATE, no read-modify-write race).
// Vote fairness is a client-side localStorage soft-guard only (see the plan); worst case is a vanity
// counter, which the 10/day upload cap already bounds the population of.

import type { PagesFunction } from '@cloudflare/workers-types'
import { json, type Env } from '../../_lib'

export const onRequestPost: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id)
  const upd = await env.DB.prepare('UPDATE creations SET upvotes = upvotes + 1 WHERE id = ?').bind(id).run()
  if (!upd.meta || upd.meta.changes === 0) return json(404, { error: 'not_found' })
  const row = await env.DB.prepare('SELECT upvotes FROM creations WHERE id = ?').bind(id).first<{ upvotes: number }>()
  return json(200, { upvotes: row?.upvotes ?? 0 })
}
