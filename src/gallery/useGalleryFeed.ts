// The gallery feed: sort / tiling filter / debounced search + keyset (cursor) pagination for infinite
// scroll. A generation ref invalidates in-flight responses when the filters change (and aborts the
// network), so a slow first-page reply can't overwrite a newer filter's results.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, listCreations } from './api'
import type { CreationItem, GallerySort } from './types'

const PAGE = 24

function errMsg(e: unknown): string {
  if (e instanceof ApiError || e instanceof Error) return e.message
  return 'Something went wrong'
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function useGalleryFeed() {
  const [sort, setSort] = useState<GallerySort>('new')
  const [tiling, setTiling] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const q = useDebounced(query, 300)

  const [items, setItems] = useState<CreationItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const genRef = useRef(0)

  // Fresh first page whenever the filters change (or a manual reload). Aborts the previous request.
  useEffect(() => {
    const gen = (genRef.current += 1)
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    listCreations({ sort, tiling, q, limit: PAGE }, ctrl.signal)
      .then((res) => {
        if (genRef.current !== gen) return
        setItems(res.items)
        setCursor(res.nextCursor)
        setHasMore(res.nextCursor !== null)
        setLoading(false)
      })
      .catch((e) => {
        if (genRef.current !== gen || ctrl.signal.aborted) return
        setError(errMsg(e))
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [sort, tiling, q, reloadNonce])

  const loadMore = useCallback(() => {
    if (loading || !hasMore || !cursor) return
    const gen = genRef.current // valid only within the current filter generation
    setLoading(true)
    listCreations({ sort, tiling, q, cursor, limit: PAGE })
      .then((res) => {
        if (genRef.current !== gen) return
        setItems((cur) => [...cur, ...res.items])
        setCursor(res.nextCursor)
        setHasMore(res.nextCursor !== null)
        setLoading(false)
      })
      .catch((e) => {
        if (genRef.current !== gen) return
        setError(errMsg(e))
        setLoading(false)
      })
  }, [loading, hasMore, cursor, sort, tiling, q])

  // Set a creation's upvote count (optimistic bump + server reconcile / revert).
  const applyUpvote = useCallback((id: string, upvotes: number) => {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, upvotes } : it)))
  }, [])

  const reload = useCallback(() => setReloadNonce((n) => n + 1), [])

  return {
    sort,
    setSort,
    tiling,
    setTiling,
    query,
    setQuery,
    items,
    loading,
    error,
    hasMore,
    loadMore,
    applyUpvote,
    reload,
  }
}
