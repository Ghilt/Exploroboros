import './GallerySpotlight.css'
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, fetchRecipe } from '../gallery/api'
import { getTiling } from '../data/tilings'
import { setPendingRecipe } from '../state/pendingRecipe'
import { hrefFor } from '../router/useHashRoute'
import type { CreationItem } from '../gallery/types'

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

        <div className="spot-image">
          <img src={item.imageUrl} alt={item.name} />
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
            <button type="button" className="btn btn-primary" onClick={importToCanvas} disabled={importing}>
              {importing ? 'Opening…' : 'Import to canvas'}
            </button>
          </div>
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
