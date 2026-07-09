import { describe, it, expect } from 'vitest'
import { gallerySpotlightHref, spotlightIdFromHash } from './useHashRoute'

describe('gallery spotlight deep links', () => {
  it('builds a #/gallery/<id> hash', () => {
    expect(gallerySpotlightHref('abc-123')).toBe('#/gallery/abc-123')
  })

  it('percent-encodes an id with unusual characters', () => {
    expect(gallerySpotlightHref('a b/c')).toBe('#/gallery/a%20b%2Fc')
  })

  it('reads the id back out of a spotlight hash', () => {
    expect(spotlightIdFromHash('#/gallery/abc-123')).toBe('abc-123')
  })

  it('round-trips an id through href → parse (incl. encoding)', () => {
    const id = 'a b/c'
    expect(spotlightIdFromHash(gallerySpotlightHref(id))).toBe(id)
  })

  it('returns null for the plain gallery and other routes', () => {
    expect(spotlightIdFromHash('#/gallery')).toBeNull()
    expect(spotlightIdFromHash('#/gallery/')).toBeNull()
    expect(spotlightIdFromHash('#/canvas')).toBeNull()
    expect(spotlightIdFromHash('#/')).toBeNull()
    expect(spotlightIdFromHash('')).toBeNull()
  })
})
