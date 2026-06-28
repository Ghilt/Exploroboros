import type { Recipe } from '../export'
import { GALLERY_RECIPES } from './galleryRecipes'

export type GalleryItem = {
  id: string
  src: string
  title: string
  // The real generation recipe for this image, keyed by filename in galleryRecipes.ts. Undefined for
  // images not yet ported (they show as thumbnails but can't be opened until their recipe lands).
  recipe?: Recipe
}

// Auto-discovered at build time: any image dropped into src/assets/gallery
// shows up here (and in the gallery) automatically — no list to maintain.
// vite-imagetools resizes + re-encodes each to a lean WebP (originals untouched),
// so a 20 MB source PNG ships as a ~100 KB image.
const modules = import.meta.glob('../assets/gallery/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  query: '?w=1200&format=webp&quality=80',
  import: 'default',
}) as Record<string, string>

function fileOf(path: string): string {
  return path.split('/').pop() ?? path
}

function labelFromPath(path: string): string {
  return fileOf(path)
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim()
}

export const GALLERY: ReadonlyArray<GalleryItem> = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, src]) => ({
    id: path,
    src,
    title: labelFromPath(path),
    recipe: GALLERY_RECIPES[fileOf(path)],
  }))

// Fisher-Yates sample, used for the landing teaser's random pick.
export function pickRandom<T>(items: ReadonlyArray<T>, count: number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}
