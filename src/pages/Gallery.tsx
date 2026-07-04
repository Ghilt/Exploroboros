import './Gallery.css'
import { useEffect, useRef, useState } from 'react'
import { useGalleryFeed } from '../gallery/useGalleryFeed'
import { useVotedStore } from '../gallery/useVotedStore'
import { upvoteCreation } from '../gallery/api'
import { GalleryCard } from '../components/GalleryCard'
import { GallerySpotlight } from '../components/GallerySpotlight'
import { SegmentedControl } from '../components/SegmentedControl'
import { TILINGS } from '../data/tilings'
import type { CreationItem } from '../gallery/types'

// The community gallery — a live, server-backed page: search / sort / filter-by-tiling, infinite scroll,
// upvotes, and a spotlight view (message + tiling + "Import to canvas"). Uploads land here via the
// canvas Export → "Share to the gallery" flow.
export function Gallery() {
  const feed = useGalleryFeed()
  const { loadMore } = feed
  const { hasVoted, markVoted } = useVotedStore()
  const [spotlightId, setSpotlightId] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

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

  // Upvote once per browser: optimistic bump, reconcile to the server count, revert the count on failure.
  const upvote = async (item: CreationItem) => {
    if (hasVoted(item.id)) return
    markVoted(item.id)
    feed.applyUpvote(item.id, item.upvotes + 1)
    try {
      const res = await upvoteCreation(item.id)
      feed.applyUpvote(item.id, res.upvotes)
    } catch {
      feed.applyUpvote(item.id, item.upvotes)
    }
  }

  const spotlight = spotlightId ? (feed.items.find((i) => i.id === spotlightId) ?? null) : null

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
              onOpen={() => setSpotlightId(it.id)}
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
          onClose={() => setSpotlightId(null)}
        />
      )}
    </div>
  )
}
