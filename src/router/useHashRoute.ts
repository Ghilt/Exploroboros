import { useSyncExternalStore } from 'react'

// Hash-based routing — no dependency and no server config: each route is a
// fragment like #/canvas, so static hosting (Vercel) needs no SPA rewrite.
// Swap for a real router (e.g. react-router) if we later need nested routes,
// the history API, or data loaders.
export type Route = 'landing' | 'canvas' | 'gallery' | 'guide'

const PATHS: Record<Route, string> = {
  landing: '#/',
  canvas: '#/canvas',
  gallery: '#/gallery',
  guide: '#/guide',
}

export function hrefFor(route: Route): string {
  return PATHS[route]
}

// The gallery can deep-link to one creation's spotlight: #/gallery/<id>. It still parses as the gallery
// route (startsWith below), and the id rides after the slash so a shared link reopens that exact image.
export function gallerySpotlightHref(id: string): string {
  return `#/gallery/${encodeURIComponent(id)}`
}

// Pull the creation id out of a #/gallery/<id> hash, or null for the plain gallery / any other route.
// Reads the raw hash (not the lower-cased route path) so a case-sensitive id survives.
export function spotlightIdFromHash(hash: string): string | null {
  const m = /^#\/gallery\/(.+)$/.exec(hash)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').toLowerCase()
  if (path.startsWith('canvas')) return 'canvas'
  if (path.startsWith('gallery')) return 'gallery'
  if (path.startsWith('guide')) return 'guide'
  return 'landing'
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  return parse(hash)
}
