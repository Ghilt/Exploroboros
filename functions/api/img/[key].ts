// GET /api/img/:key — stream a compact image from the (private) R2 bucket. `key` is "<id>.webp".
// Keys never change, so the response is cached hard (immutable) at the edge + browser → repeat scrolls
// are effectively free. This is the ONLY route with a long cache; all JSON routes are no-store.

import type { PagesFunction } from '@cloudflare/workers-types'
import type { Env } from '../_lib'

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const key = String(params.key)
  const object = await env.BUCKET.get(`img/${key}`)
  if (!object) return new Response('Not found', { status: 404 })
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  return new Response(object.body, { status: 200, headers })
}
