import './CustomPredicatesDialog.css'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PredicatePane } from './PredicatePane'
import type { PredicateStore } from '../state/predicateStore'

// The Custom-predicates library as a modal (the HelpButton/TilingPicker/ConfirmDialog recipe — portal,
// backdrop-click + Escape close, focus management, body scroll lock). It hosts the full PredicatePane,
// so predicates are authored from any pane's "Custom predicates" badge instead of a dedicated dock.
export function CustomPredicatesDialog({
  store,
  traverserNames,
  onClose,
}: {
  store: PredicateStore
  // Traverser names so a predicate name can be validated as unique against them too.
  traverserNames?: ReadonlyArray<string>
  onClose: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus the dialog on open; restore focus to whatever opened it (a badge button) on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => prev?.focus?.()
  }, [])

  // Escape closes; lock body scroll so only the dialog floats above the fade.
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

  return createPortal(
    <div
      className="preds-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="preds-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="preds-dialog-head">
          <h2 id={titleId} className="preds-dialog-title">
            Custom predicates
          </h2>
          <button type="button" className="preds-dialog-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="preds-dialog-body">
          <PredicatePane store={store} traverserNames={traverserNames} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
