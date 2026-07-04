// Shared helpers for the community-gallery Pages Functions. Everything here is pure and unit-tested in
// _lib.test.ts — no Workers globals are touched at import time (only inside the exported functions), so
// the query/cursor/validation logic runs under Vitest without a Workers runtime. Types come from
// @cloudflare/workers-types and are erased at build. A leading-underscore filename is NOT a route.

import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
}

// Server-enforced limits (the client mirrors them for UX only — never trust the client).
export const DAILY_CAP = 10
export const MAX_NAME = 60
export const MAX_MESSAGE = 280
export const MAX_RECIPE_BYTES = 32 * 1024
export const MAX_IMAGE_BYTES = 1_500_000
export const PAGE_DEFAULT = 24
export const PAGE_MAX = 48

export type Sort = 'new' | 'top' | 'name'
export function parseSort(v: string | null): Sort {
  return v === 'top' || v === 'name' ? v : 'new'
}

// A JSON API response. Defaults to `no-store`: list / recipe / upvote payloads change (new uploads,
// vote counts), so they must never be cached — only the immutable image route sets a long cache.
export function json(status: number, data: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

// Escape LIKE wildcards so a user typing % or _ can't broaden the match; paired with `ESCAPE '\'`.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => '\\' + ch)
}

// WebP magic bytes: "RIFF"...."WEBP". Don't trust the multipart content-type.
export function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
}

// Keyset cursor: the last row's full ordering tuple, base64url-encoded (opaque to the client).
export type Cursor = { id: string; createdAt: number; upvotes: number; name: string }

export function encodeCursor(c: Cursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(c))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCursor(s: string | null): Cursor | null {
  if (!s) return null
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
    const c = JSON.parse(new TextDecoder().decode(bytes)) as Cursor
    if (
      typeof c.id === 'string' &&
      typeof c.createdAt === 'number' &&
      typeof c.upvotes === 'number' &&
      typeof c.name === 'string'
    ) {
      return c
    }
    return null
  } catch {
    return null
  }
}

// Build the list SELECT for a sort / filter / search / cursor page. `LIMIT limit+1` lets the caller
// peek for a next page without a COUNT; `id` breaks every tie so paging is totally ordered (the same
// tiebreaker the indexes carry — see migrations/0001_init.sql).
export function buildListQuery(opts: {
  sort: Sort
  tiling?: string | null
  q?: string | null
  cursor?: Cursor | null
  limit: number
}): { sql: string; params: unknown[] } {
  const where: string[] = []
  const params: unknown[] = []

  if (opts.tiling) {
    where.push('tiling_id = ?')
    params.push(opts.tiling)
  }
  if (opts.q && opts.q.trim()) {
    where.push("name LIKE ? ESCAPE '\\' COLLATE NOCASE")
    params.push('%' + escapeLike(opts.q.trim()) + '%')
  }

  const c = opts.cursor
  if (c) {
    if (opts.sort === 'new') {
      where.push('(created_at < ? OR (created_at = ? AND id < ?))')
      params.push(c.createdAt, c.createdAt, c.id)
    } else if (opts.sort === 'top') {
      where.push(
        '(upvotes < ? OR (upvotes = ? AND created_at < ?) OR (upvotes = ? AND created_at = ? AND id < ?))',
      )
      params.push(c.upvotes, c.upvotes, c.createdAt, c.upvotes, c.createdAt, c.id)
    } else {
      where.push('(name > ? COLLATE NOCASE OR (name = ? COLLATE NOCASE AND id > ?))')
      params.push(c.name, c.name, c.id)
    }
  }

  const orderBy =
    opts.sort === 'new'
      ? 'created_at DESC, id DESC'
      : opts.sort === 'top'
        ? 'upvotes DESC, created_at DESC, id DESC'
        : 'name COLLATE NOCASE ASC, id ASC'

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  params.push(opts.limit + 1)
  const sql = `SELECT id, name, message, tiling_id, image_key, width, height, upvotes, created_at FROM creations ${whereSql} ORDER BY ${orderBy} LIMIT ?`
  return { sql, params }
}

// A D1 row → the API item the client consumes. `recipe_json` is deliberately NOT in the list payload
// (kept small for smooth infinite scroll) — it's fetched lazily via /recipe on import.
export type CreationRow = {
  id: string
  name: string
  message: string
  tiling_id: string
  image_key: string
  width: number
  height: number
  upvotes: number
  created_at: number
}

export type CreationItem = {
  id: string
  name: string
  message: string
  tilingId: string
  imageUrl: string
  width: number
  height: number
  upvotes: number
  createdAt: number
}

export function mapRow(r: CreationRow): CreationItem {
  return {
    id: r.id,
    name: r.name,
    message: r.message,
    tilingId: r.tiling_id,
    imageUrl: `/api/img/${r.id}.webp`,
    width: r.width,
    height: r.height,
    upvotes: r.upvotes,
    createdAt: r.created_at,
  }
}

export function cursorFromItem(i: CreationItem): Cursor {
  return { id: i.id, createdAt: i.createdAt, upvotes: i.upvotes, name: i.name }
}

// Midnight (UTC) of the day containing `now`, in epoch ms — the lower bound for the daily upload cap.
export function startOfUtcDayMs(now: number): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
