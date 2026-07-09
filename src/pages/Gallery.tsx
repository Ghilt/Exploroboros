import './Gallery.css'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useGalleryFeed } from '../gallery/useGalleryFeed'
import { useVotedStore } from '../gallery/useVotedStore'
import { ApiError, fetchCreation, upvoteCreation } from '../gallery/api'
import { GalleryCard } from '../components/GalleryCard'
import { GallerySpotlight } from '../components/GallerySpotlight'
import { SegmentedControl } from '../components/SegmentedControl'
import { TILINGS } from '../data/tilings'
import { gallerySpotlightHref, hrefFor, spotlightIdFromHash } from '../router/useHashRoute'
import type { CreationItem } from '../gallery/types'

function errMsg(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) return 'That creation could not be found — it may have been removed.'
  if (e instanceof ApiError || e instanceof Error) return e.message
  return 'Could not load this creation'
}

// The spotlighted creation id lives in the URL hash (#/gallery/<id>), so a direct link opens that image
// and the browser Back button closes it. Reading it via useSyncExternalStore keeps the whole page in
// sync with hashchange (deep link, Back/Forward, the Share button) with no extra state to reconcile.
function useSpotlightId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    () => spotlightIdFromHash(window.location.hash),
    () => null,
  )
}

// The community gallery — a live, server-backed page: search / sort / filter-by-tiling, infinite scroll,
// upvotes, and a spotlight view (message + tiling + Share + "Import to canvas"). Uploads land here via
// the canvas Export → "Share to the gallery" flow.
export function Gallery() {
  const feed = useGalleryFeed()
  const { loadMore } = feed
  const { hasVoted, markVoted } = useVotedStore()
  const spotlightId = useSpotlightId()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const openSpotlight = useCallback((id: string) => {
    window.location.hash = gallerySpotlightHref(id)
  }, [])
  const closeSpotlight = useCallback(() => {
    window.location.hash = hrefFor('gallery')
  }, [])

  // Infinite scroll: load the next page as the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  // Upvote once per browser: optimistic bump, reconcile to the server count, revert on failure. Keeps
  // both the feed copy and a directly-fetched spotlight copy in sync.
  const upvote = async (item: CreationItem) => {
    if (hasVoted(item.id)) return
    markVoted(item.id)
    const setCount = (n: number) => {
      feed.applyUpvote(item.id, n)
      setFetched((f) => (f && f.id === item.id ? { ...f, upvotes: n } : f))
    }
    setCount(item.upvotes + 1)
    try {
      const res = await upvoteCreation(item.id)
      setCount(res.upvotes)
    } catch {
      setCount(item.upvotes)
    }
  }

  // Resolve the spotlight item: prefer the feed copy (its upvote count stays live); otherwise fetch just
  // that one creation — a shared link can point past the loaded page, or land before the feed loads.
  const feedItem = spotlightId ? feed.items.find((i) => i.id === spotlightId) ?? null : null
  const [fetched, setFetched] = useState<CreationItem | null>(null)
  const [spotErr, setSpotErr] = useState<string | null>(null)

  useEffect(() => {
    if (!spotlightId || feedItem) {
      setSpotErr(null)
      return
    }
    if (fetched?.id === spotlightId) return
    let alive = true
    setSpotErr(null)
    fetchCreation(spotlightId)
      .then((it) => alive && setFetched(it))
      .catch((e) => alive && setSpotErr(errMsg(e)))
    return () => {
      alive = false
    }
  }, [spotlightId, feedItem, fetched])

  const spotlight = feedItem ?? (fetched && fetched.id === spotlightId ? fetched : null)

  return (
    <div className="gallery-page">
      <header className="page-head">
        <p className="page-eyebrow">Showcase</p>
        <h1 className="page-title">Gallery</h1>
        <p className="page-lead">
          Creations shared by anyone. Upvote your favourites, or open one in the canvas and keep going.
        </p>
      </header>

      <div className="gallery-controls">
        <input
          className="gallery-search"
          type="search"
          value={feed.query}
          onChange={(e) => feed.setQuery(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search creations by name"
        />
        <SegmentedControl
          value={feed.sort}
          onChange={feed.setSort}
          ariaLabel="Sort creations"
          options={[
            { value: 'new', label: 'Newest', title: 'Most recent first' },
            { value: 'top', label: 'Top', title: 'Most upvoted first' },
            { value: 'name', label: 'A–Z', title: 'By name' },
          ]}
        />
        <select
          className="gallery-filter"
          value={feed.tiling ?? ''}
          onChange={(e) => feed.setTiling(e.target.value || null)}
          aria-label="Filter by tiling"
        >
          <option value="">All tilings</option>
          {TILINGS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {feed.error && (
        <p className="gallery-error" role="alert">
          {feed.error}{' '}
          <button type="button" className="btn btn-ghost" onClick={feed.reload}>
            Retry
          </button>
        </p>
      )}

      {feed.items.length > 0 && (
        <div className="gallery-grid">
          {feed.items.map((it) => (
            <GalleryCard
              key={it.id}
              item={it}
              voted={hasVoted(it.id)}
              onUpvote={() => upvote(it)}
              onOpen={() => openSpotlight(it.id)}
            />
          ))}
        </div>
      )}

      {feed.loading && <div className="gallery-status">Loading…</div>}

      {!feed.loading && !feed.error && feed.items.length === 0 && (
        <div className="gallery-empty">
          <p className="gallery-empty-lead">
            {feed.query || feed.tiling ? 'Nothing matches that yet.' : 'No creations shared yet.'}
          </p>
          <p className="gallery-empty-hint">
            Make something in the canvas, export it, then hit “Share to the gallery”.
          </p>
        </div>
      )}

      <div ref={sentinelRef} className="gallery-sentinel" aria-hidden="true" />

      {spotlight && (
        <GallerySpotlight
          item={spotlight}
          voted={hasVoted(spotlight.id)}
          onUpvote={() => upvote(spotlight)}
          onClose={closeSpotlight}
        />
      )}

      {/* A deep link is resolving (feed miss) or failed — a small modal covers the fetch/error. */}
      {spotlightId && !spotlight && (
        <div
          className="spot-modal"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeSpotlight()
          }}
        >
          <div className="spot-dialog spot-dialog--status" role="dialog" aria-modal="true">
            <button type="button" className="spot-close" onClick={closeSpotlight} title="Close" aria-label="Close">
              ×
            </button>
            {spotErr ? (
              <p className="spot-status spot-status--error" role="alert">
                {spotErr}
              </p>
            ) : (
              <p className="spot-status">Loading…</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
