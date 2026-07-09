// Client for the community-gallery API. Same-origin (SPA + Pages Functions on one Cloudflare Pages
// origin), so relative paths — no base URL, no env var. `ApiError` carries the HTTP status + the
// server's error code so callers can special-case (e.g. 429 daily_cap).

import { parseRecipe, type Recipe } from '../export'
import type { CreationItem, GallerySort, ListResponse } from './types'

const API = '/api'

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function fail(res: Response): Promise<never> {
  let code: string | undefined
  let message = `Request failed (${res.status})`
  try {
    const j = (await res.json()) as { error?: string; message?: string }
    code = j.error
    if (j.message) message = j.message
    else if (j.error) message = j.error
  } catch {
    // non-JSON error body — keep the generic message
  }
  throw new ApiError(res.status, message, code)
}

export async function listCreations(
  params: { sort?: GallerySort; tiling?: string | null; q?: string; cursor?: string | null; limit?: number },
  signal?: AbortSignal,
): Promise<ListResponse> {
  const sp = new URLSearchParams()
  if (params.sort) sp.set('sort', params.sort)
  if (params.tiling) sp.set('tiling', params.tiling)
  if (params.q && params.q.trim()) sp.set('q', params.q.trim())
  if (params.cursor) sp.set('cursor', params.cursor)
  if (params.limit) sp.set('limit', String(params.limit))
  const res = await fetch(`${API}/creations?${sp.toString()}`, { signal })
  if (!res.ok) return fail(res)
  return (await res.json()) as ListResponse
}

export async function uploadCreation(
  fields: { name: string; message: string; recipe: Recipe; image: Blob; width: number; height: number },
  signal?: AbortSignal,
): Promise<{ id: string; imageUrl: string }> {
  const fd = new FormData()
  fd.set('name', fields.name)
  fd.set('message', fields.message)
  fd.set('recipe', JSON.stringify(fields.recipe))
  fd.set('width', String(fields.width))
  fd.set('height', String(fields.height))
  fd.set('image', fields.image, 'creation.webp')
  const res = await fetch(`${API}/creations`, { method: 'POST', body: fd, signal })
  if (!res.ok) return fail(res)
  return (await res.json()) as { id: string; imageUrl: string }
}

export async function upvoteCreation(id: string): Promise<{ upvotes: number }> {
  const res = await fetch(`${API}/creations/${encodeURIComponent(id)}/upvote`, { method: 'POST' })
  if (!res.ok) return fail(res)
  return (await res.json()) as { upvotes: number }
}

// One creation's list-shaped item — used to open a spotlight from a direct #/gallery/:id link when the
// creation isn't on the current feed page (or the feed hasn't loaded yet).
export async function fetchCreation(id: string): Promise<CreationItem> {
  const res = await fetch(`${API}/creations/${encodeURIComponent(id)}`)
  if (!res.ok) return fail(res)
  const j = (await res.json()) as { item: CreationItem }
  return j.item
}

export async function fetchRecipe(id: string): Promise<Recipe> {
  const res = await fetch(`${API}/creations/${encodeURIComponent(id)}/recipe`)
  if (!res.ok) return fail(res)
  const j = (await res.json()) as { recipe: unknown }
  // The row was normalised to whatever schema was CURRENT when it was uploaded — an older creation
  // predates a later schema bump, so migrate it here (the same gate the PNG-import path uses) instead
  // of trusting the server's JSON as already the current shape.
  const parsed = parseRecipe(JSON.stringify(j.recipe))
  if (!parsed.ok) {
    throw new Error(parsed.reason === 'too-new' ? 'Made with a newer version — update to open.' : "This creation's data could not be read.")
  }
  return parsed.recipe
}

export type { CreationItem, GallerySort, ListResponse }
