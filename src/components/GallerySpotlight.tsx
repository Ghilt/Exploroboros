import './GallerySpotlight.css'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, fetchRecipe } from '../gallery/api'
import { getTiling } from '../data/tilings'
import { setPendingRecipe } from '../state/pendingRecipe'
import { gallerySpotlightHref, hrefFor } from '../router/useHashRoute'
import type { CreationItem } from '../gallery/types'

// The classic "share" glyph — three nodes joined by two links (Material/Feather share-2), in the app's
// stroked line-icon idiom so it sits with the chevrons/brand mark.
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

// The absolute, shareable URL for this creation's spotlight (#/gallery/<id> on the current origin).
function spotlightUrl(id: string): string {
  const url = new URL(window.location.href)
  url.hash = gallerySpotlightHref(id)
  return url.toString()
}

const MIN_ZOOM = 1
const MAX_ZOOM = 5
const ZOOM_SPEED = 0.0018

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

// The maximized "spotlight" view of one creation: the large image, its message, which tiling it's on,
// an upvote button, and "Import to canvas" (fetches the recipe lazily, then hands off exactly like the
// old static gallery: setPendingRecipe → navigate to the canvas). Reuses the app's modal recipe.
type Props = {
  item: CreationItem
  voted: boolean
  onUpvote: () => void
  onClose: () => void
}

export function GallerySpotlight({ item, voted, onUpvote, onClose }: Props) {
  const titleId = useId()
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareErr, setShareErr] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 })
  const imageWrapRef = useRef<HTMLDivElement>(null)

  const tilingName = getTiling(item.tilingId)?.name ?? item.tilingId

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  // Reset the zoom whenever the spotlighted creation changes (e.g. Back/Forward to another id).
  useEffect(() => {
    setZoom(1)
    setZoomOrigin({ x: 50, y: 50 })
  }, [item.id])

  // Scroll-wheel zoom on the image, centered on the cursor. A native (non-React) listener is needed
  // because React marks onWheel passive by default, so preventDefault() there can't stop page scroll.
  useEffect(() => {
    const el = imageWrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      setZoomOrigin({
        x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
      })
      setZoom((z) => clamp(z - e.deltaY * ZOOM_SPEED, MIN_ZOOM, MAX_ZOOM))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Share this exact spotlight. Touch devices get the native share sheet (the expected gesture);
  // desktop copies the link with inline "Copied!" feedback — predictable, no OS sheet.
  const share = async () => {
    const url = spotlightUrl(item.id)
    setShareErr(null)
    const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
    if (coarse && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: item.name, url })
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return // user dismissed the sheet
        // any other failure → fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setShareErr('Could not copy the link — copy it from the address bar.')
    }
  }

  const importToCanvas = async () => {
    setImporting(true)
    setImportErr(null)
    try {
      const recipe = await fetchRecipe(item.id)
      setPendingRecipe(recipe)
      window.location.hash = hrefFor('canvas')
    } catch (e) {
      setImportErr(e instanceof ApiError || e instanceof Error ? e.message : 'Could not load this creation')
      setImporting(false)
    }
  }

  return createPortal(
    <div
      className="spot-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="spot-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <button type="button" className="spot-close" onClick={onClose} title="Close" aria-label="Close">
          ×
        </button>

        <div className={`spot-image${zoom > 1 ? ' is-zoomed' : ''}`} ref={imageWrapRef}>
          <img
            src={item.imageUrl}
            alt={item.name}
            style={{ transform: `scale(${zoom})`, transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }}
          />
        </div>

        <div className="spot-info">
          <h2 id={titleId} className="spot-name">
            {item.name}
          </h2>
          <p className="spot-tiling">
            on <strong>{tilingName}</strong>
          </p>
          {item.message ? <p className="spot-message">{item.message}</p> : null}

          <div className="spot-actions">
            <button
              type="button"
              className={`btn spot-vote${voted ? ' is-voted' : ''}`}
              onClick={onUpvote}
              disabled={voted}
              title={voted ? 'You upvoted this' : 'Upvote'}
            >
              <span aria-hidden="true">▲</span> {item.upvotes}
            </button>
            <span className="spot-share-wrap">
              <button
                type="button"
                className="btn spot-share"
                onClick={share}
                title="Copy a direct link to this creation"
                aria-label="Share"
              >
                <ShareIcon />
              </button>
              {copied && (
                <span className="spot-share-tip" role="status">
                  Copied!
                </span>
              )}
            </span>
            <button type="button" className="btn btn-primary" onClick={importToCanvas} disabled={importing}>
              {importing ? 'Opening…' : 'Import to canvas'}
            </button>
          </div>
          {shareErr && (
            <p className="spot-error" role="alert">
              {shareErr}
            </p>
          )}
          {importErr && (
            <p className="spot-error" role="alert">
              {importErr}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
