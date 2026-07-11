import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchCreation, fetchRecipe } from './api'
import type { CreationItem } from './types'

function fakeResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response
}

describe('fetchCreation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the single creation item on success', async () => {
    const item: CreationItem = {
      id: 'x',
      name: 'Spiral',
      message: 'hi',
      tilingId: 'square',
      imageUrl: '/api/img/x.webp',
      width: 512,
      height: 512,
      upvotes: 3,
      createdAt: 1,
    }
    const fetchSpy = vi.fn().mockResolvedValue(fakeResponse({ item }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(fetchCreation('x')).resolves.toEqual(item)
    expect(fetchSpy).toHaveBeenCalledWith('/api/creations/x')
  })

  it('throws an ApiError carrying the status/code when the creation is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) } as Response),
    )
    await expect(fetchCreation('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })
})

describe('fetchRecipe', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws a friendly error for a creation stored under a schema below v10 (the @→. migration bridge was removed)', async () => {
    // A row uploaded back when v3 (gridN, no gridW/gridH) was current — the server stores the recipe
    // as-normalised-at-upload-time and never re-migrates it, so this is what an old row's GET returns.
    // The v9→v10 bridge was intentionally dropped (see recipe.ts's MIGRATIONS comment), so a pre-v10 row
    // now fails to read instead of silently migrating — the same friendly error as any corrupt recipe.
    const stored = {
      app: 'exploroboros',
      schemaVersion: 3,
      tilingId: 'square',
      gridN: 40,
      output: { width: 512, height: 512, edges: false, background: null },
      seeds: [],
      paint: [],
      predicates: [],
      traversers: [],
      coloringRules: [],
      initialState: '',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ recipe: stored })))
    await expect(fetchRecipe('abc')).rejects.toThrow(/could not be read/i)
  })

  it('throws a friendly error when the stored recipe is corrupt rather than handing back a broken object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse({ recipe: { app: 'exploroboros' } })))
    await expect(fetchRecipe('abc')).rejects.toThrow(/could not be read/i)
  })
})
