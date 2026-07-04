// GET /api/creations/:id/recipe — the full recipe for one creation, fetched lazily when the user hits
// "Import to canvas" (kept out of the list payload so infinite scroll stays light).

import type { PagesFunction } from '@cloudflare/workers-types'
import { json, type Env } from '../../_lib'

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id)
  const row = await env.DB.prepare('SELECT recipe_json FROM creations WHERE id = ?').bind(id).first<{ recipe_json: string }>()
  if (!row) return json(404, { error: 'not_found' })
  let recipe: unknown
  try {
    recipe = JSON.parse(row.recipe_json)
  } catch {
    return json(500, { error: 'corrupt_recipe' })
  }
  return json(200, { recipe })
}
