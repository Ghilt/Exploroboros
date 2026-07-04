import './ConfirmDialog.css'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

// A yes/no confirmation modal for a consequential action (e.g. an import that overwrites the panes).
// Reuses the HelpButton/TilingPicker modal recipe — portal, backdrop-click + Escape close, focus
// management, body scroll lock — with a two-button footer. Cancel is the safe default (Escape,
// backdrop, and initial focus all land on it), so a stray Enter/Escape never triggers the action.
type Props = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId()
  const msgId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus Cancel on open; restore focus to whatever was focused before (the import came from a drop
  // or a hidden file input, so there's no single trigger ref to hand in). Capture at setup.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => prev?.focus?.()
  }, [])

  // Escape cancels; lock body scroll so only the dialog floats above the fade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel])

  return createPortal(
    <div
      className="confirm-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={msgId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <h2 id={titleId} className="confirm-dialog-title">
          {title}
        </h2>
        <p id={msgId} className="confirm-dialog-msg">
          {message}
        </p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-ghost" ref={cancelRef} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-primary${danger ? ' confirm-danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
