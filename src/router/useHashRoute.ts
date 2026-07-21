import { useSyncExternalStore } from 'react'

// Hash-based routing — no dependency and no server config: each route is a
// fragment like #/canvas, so static hosting (Vercel) needs no SPA rewrite.
// Swap for a real router (e.g. react-router) if we later need nested routes,
// the history API, or data loaders.
// 'daily' is the (currently hidden) daily word game — reachable by typing #/daily; no Nav link yet.
export type Route = 'landing' | 'canvas' | 'gallery' | 'guide' | 'tutorial' | 'daily'

const PATHS: Record<Route, string> = {
  landing: '#/',
  canvas: '#/canvas',
  gallery: '#/gallery',
  guide: '#/guide',
  tutorial: '#/tutorial',
  daily: '#/daily',
}

export function hrefFor(route: Route): string {
  return PATHS[route]
}

// The tutorial can deep-link to one chapter's guided view: #/tutorial/<id>. It still parses as the
// tutorial route (startsWith below); the chapter id rides after the slash (same shape as the gallery
// spotlight sub-route) so a chapter button links straight into its walkthrough.
export function tutorialChapterHref(id: string): string {
  return `#/tutorial/${encodeURIComponent(id)}`
}

// Pull the chapter id out of a #/tutorial/<id> hash, or null for the plain tutorial landing / other
// routes. Reads the raw hash (not the lower-cased route path) so a case-sensitive id survives.
export function chapterIdFromHash(hash: string): string | null {
  const m = /^#\/tutorial\/(.+)$/.exec(hash)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
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
  if (path.startsWith('tutorial')) return 'tutorial'
  if (path.startsWith('daily')) return 'daily'
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
