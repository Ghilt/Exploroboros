import { describe, it, expect } from 'vitest'
import {
  buildListQuery,
  cursorFromItem,
  decodeCursor,
  encodeCursor,
  escapeLike,
  isWebp,
  mapRow,
  parseSort,
  startOfUtcDayMs,
  type CreationRow,
} from './_lib'

describe('escapeLike', () => {
  it('escapes LIKE metacharacters, leaves the rest', () => {
    expect(escapeLike('50% _off_ \\o/')).toBe('50\\% \\_off\\_ \\\\o/')
    expect(escapeLike('plain text')).toBe('plain text')
  })
})

describe('isWebp', () => {
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56])
  it('accepts a RIFF....WEBP header', () => expect(isWebp(webp)).toBe(true))
  it('rejects a PNG header', () => {
    expect(isWebp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
  })
  it('rejects a too-short buffer', () => expect(isWebp(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false))
})

describe('cursor round-trip', () => {
  it('encodes + decodes, including a unicode name', () => {
    const c = { id: 'abc-123', createdAt: 1_700_000_000_000, upvotes: 7, name: 'Frøst — 日本 ✨' }
    const round = decodeCursor(encodeCursor(c))
    expect(round).toEqual(c)
  })
  it('is url-safe (no + / =)', () => {
    const s = encodeCursor({ id: 'x'.repeat(30), createdAt: 1, upvotes: 999, name: '???>>>' })
    expect(s).not.toMatch(/[+/=]/)
  })
  it('returns null for null / garbage', () => {
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor('not-base64-@@@')).toBeNull()
    expect(decodeCursor(encodeCursor({ id: 'x', createdAt: 1, upvotes: 2, name: 'y' }).slice(0, 3))).toBeNull()
  })
})

describe('parseSort', () => {
  it('defaults to new, passes through top/name', () => {
    expect(parseSort(null)).toBe('new')
    expect(parseSort('bogus')).toBe('new')
    expect(parseSort('top')).toBe('top')
    expect(parseSort('name')).toBe('name')
  })
})

describe('buildListQuery', () => {
  it('newest, no filters → order by created_at, only the limit param', () => {
    const { sql, params } = buildListQuery({ sort: 'new', limit: 24 })
    expect(sql).toContain('ORDER BY created_at DESC, id DESC')
    expect(sql).not.toContain('WHERE')
    expect(params).toEqual([25])
  })

  it('filter + search → WHERE with both, params in ? order', () => {
    const { sql, params } = buildListQuery({ sort: 'new', tiling: 'square', q: ' xor ', limit: 10 })
    expect(sql).toContain('WHERE tiling_id = ? AND name LIKE ?')
    expect(sql).toContain("ESCAPE '\\'")
    expect(params).toEqual(['square', '%xor%', 11])
  })

  it('top + cursor → upvotes order and the 6 tie-break params before the limit', () => {
    const cursor = { id: 'i9', createdAt: 111, upvotes: 5, name: 'z' }
    const { sql, params } = buildListQuery({ sort: 'top', cursor, limit: 24 })
    expect(sql).toContain('ORDER BY upvotes DESC, created_at DESC, id DESC')
    expect(params).toEqual([5, 5, 111, 5, 111, 'i9', 25])
  })

  it('name sort → NOCASE order + cursor predicate', () => {
    const cursor = { id: 'i1', createdAt: 1, upvotes: 0, name: 'mid' }
    const { sql, params } = buildListQuery({ sort: 'name', cursor, limit: 5 })
    expect(sql).toContain('ORDER BY name COLLATE NOCASE ASC, id ASC')
    expect(params).toEqual(['mid', 'mid', 'i1', 6])
  })
})

describe('mapRow / cursorFromItem', () => {
  const row: CreationRow = {
    id: 'id7',
    name: 'Fern',
    message: 'hi',
    tiling_id: 'kalleboda',
    image_key: 'img/id7.webp',
    width: 1200,
    height: 900,
    upvotes: 3,
    created_at: 42,
  }
  it('maps a DB row to the API item (snake→camel + imageUrl)', () => {
    expect(mapRow(row)).toEqual({
      id: 'id7',
      name: 'Fern',
      message: 'hi',
      tilingId: 'kalleboda',
      imageUrl: '/api/img/id7.webp',
      width: 1200,
      height: 900,
      upvotes: 3,
      createdAt: 42,
    })
  })
  it('derives a cursor from an item', () => {
    expect(cursorFromItem(mapRow(row))).toEqual({ id: 'id7', createdAt: 42, upvotes: 3, name: 'Fern' })
  })
})

describe('startOfUtcDayMs', () => {
  it('floors to UTC midnight', () => {
    expect(startOfUtcDayMs(Date.UTC(2026, 6, 4, 13, 30, 15))).toBe(Date.UTC(2026, 6, 4))
  })
})
