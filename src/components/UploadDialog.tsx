import './UploadDialog.css'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Recipe } from '../export'
import { getTiling } from '../data/tilings'
import { toCompactWebp } from '../upload/compactImage'
import { uploadCreation, ApiError } from '../gallery/api'

// Share a just-exported creation to the community gallery. Reuses the ConfirmDialog/TilingPicker modal
// recipe (portal, Escape, backdrop-click, body scroll lock, focus). On submit it re-encodes the export
// PNG to a compact WebP and POSTs it + the recipe; the server enforces the 10/day cap (surfaced here as
// a friendly message). Backdrop/Escape are disabled while submitting so a stray tap can't lose the form.

const MAX_NAME = 60
const MAX_MESSAGE = 280

type Props = {
  recipe: Recipe
  image: Blob // the full export PNG; re-encoded to a compact WebP on submit
  previewUrl?: string // an existing thumbnail URL to preview (optional)
  onClose: () => void
  onUploaded: (result: { id: string }) => void
}

export function UploadDialog({ recipe, image, previewUrl, onClose, onUploaded }: Props) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const tilingName = getTiling(recipe.tilingId)?.name ?? recipe.tilingId

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    nameRef.current?.focus()
    return () => prev?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, submitting])

  const trimmed = name.trim()
  const canSubmit = trimmed.length >= 1 && trimmed.length <= MAX_NAME && message.length <= MAX_MESSAGE && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const compact = await toCompactWebp(image)
      const res = await uploadCreation({
        name: trimmed,
        message: message.trim(),
        recipe,
        image: compact.blob,
        width: compact.width,
        height: compact.height,
      })
      onUploaded({ id: res.id })
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed')
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="upload-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId} className="upload-dialog-title">
          Share to the gallery
        </h2>

        <div className="upload-preview">
          {previewUrl ? <img src={previewUrl} alt="" draggable={false} /> : <div className="upload-preview-blank" />}
          <span className="upload-tiling">
            on <strong>{tilingName}</strong>
          </span>
        </div>

        <label className="upload-field">
          <span className="upload-label">
            Name <em>shown in the gallery</em>
          </span>
          <input
            ref={nameRef}
            type="text"
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="Give it a name"
            disabled={submitting}
          />
          <span className="upload-count">
            {trimmed.length}/{MAX_NAME}
          </span>
        </label>

        <label className="upload-field">
          <span className="upload-label">
            Message <em>shown when someone opens it</em>
          </span>
          <textarea
            value={message}
            maxLength={MAX_MESSAGE}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Say a little about it (optional)"
            disabled={submitting}
          />
          <span className="upload-count">
            {message.length}/{MAX_MESSAGE}
          </span>
        </label>

        {error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}

        <div className="upload-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
