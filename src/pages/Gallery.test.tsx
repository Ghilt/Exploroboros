import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { CreationItem } from '../gallery/types'

// Hoisted so the vi.mock factories (which are hoisted above imports) can reference them.
const { fetchCreationMock, upvoteCreationMock, feedState } = vi.hoisted(() => ({
  fetchCreationMock: vi.fn(),
  upvoteCreationMock: vi.fn(),
  feedState: { items: [] as CreationItem[] },
}))

// A controllable feed — no network. Filters are inert (the deep-link/spotlight wiring is what's tested).
vi.mock('../gallery/useGalleryFeed', () => ({
  useGalleryFeed: () => ({
    sort: 'new',
    setSort: vi.fn(),
    tiling: null,
    setTiling: vi.fn(),
    query: '',
    setQuery: vi.fn(),
    items: feedState.items,
    loading: false,
    error: null,
    hasMore: false,
    loadMore: vi.fn(),
    applyUpvote: vi.fn(),
    reload: vi.fn(),
  }),
}))

// Keep the real ApiError (Gallery does `instanceof ApiError`); stub only the network calls.
vi.mock('../gallery/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../gallery/api')>()
  return { ...actual, fetchCreation: fetchCreationMock, upvoteCreation: upvoteCreationMock }
})

// Stand in for the full spotlight (which reaches for navigator.share / clipboard): just enough to assert
// which creation is showing and to exercise onClose.
vi.mock('../components/GallerySpotlight', () => ({
  GallerySpotlight: ({ item, onClose }: { item: CreationItem; onClose: () => void }) => (
    <div data-testid="spotlight">
      <span data-testid="spot-name">{item.name}</span>
      <button type="button" onClick={onClose}>
        close-spot
      </button>
    </div>
  ),
}))

import { Gallery } from './Gallery'
import { ApiError } from '../gallery/api'

function makeItem(id: string, name: string): CreationItem {
  return { id, name, message: '', tilingId: 'square', imageUrl: `/api/img/${id}.webp`, width: 100, height: 100, upvotes: 0, createdAt: 1 }
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
  feedState.items = []
  vi.clearAllMocks()
})

describe('Gallery spotlight deep links', () => {
  it('opens the spotlight for a #/gallery/<id> link when the item is already in the feed (no fetch)', () => {
    feedState.items = [makeItem('feed-1', 'Feed One')]
    window.location.hash = '#/gallery/feed-1'
    render(<Gallery />)
    expect(screen.getByTestId('spotlight')).toBeTruthy()
    expect(screen.getByTestId('spot-name').textContent).toBe('Feed One')
    expect(fetchCreationMock).not.toHaveBeenCalled()
  })

  it('fetches and spotlights a creation that is not on the loaded feed page', async () => {
    feedState.items = []
    fetchCreationMock.mockResolvedValue(makeItem('remote-1', 'Remote One'))
    window.location.hash = '#/gallery/remote-1'
    render(<Gallery />)
    expect(fetchCreationMock).toHaveBeenCalledWith('remote-1')
    expect((await screen.findByTestId('spot-name')).textContent).toBe('Remote One')
  })

  it('opens the spotlight when a card image is clicked, via the URL hash', () => {
    feedState.items = [makeItem('c1', 'Card One')]
    window.location.hash = '#/gallery'
    render(<Gallery />)
    expect(screen.queryByTestId('spotlight')).toBeNull()

    fireEvent.click(screen.getByRole('img', { name: 'Card One' }))
    fireEvent(window, new Event('hashchange')) // nudge the store in case jsdom doesn't emit it

    expect(window.location.hash).toBe('#/gallery/c1')
    expect(screen.getByTestId('spotlight')).toBeTruthy()
  })

  it('shows a friendly error for a deep link to a missing creation', async () => {
    feedState.items = []
    fetchCreationMock.mockRejectedValue(new ApiError(404, 'Request failed (404)', 'not_found'))
    window.location.hash = '#/gallery/gone'
    render(<Gallery />)
    expect(await screen.findByText(/could not be found/i)).toBeTruthy()
    expect(screen.queryByTestId('spotlight')).toBeNull()
  })

  it('closing the spotlight returns to the plain gallery hash', () => {
    feedState.items = [makeItem('feed-1', 'Feed One')]
    window.location.hash = '#/gallery/feed-1'
    render(<Gallery />)
    fireEvent.click(screen.getByRole('button', { name: 'close-spot' }))
    fireEvent(window, new Event('hashchange'))
    expect(window.location.hash).toBe('#/gallery')
    expect(screen.queryByTestId('spotlight')).toBeNull()
  })
})
