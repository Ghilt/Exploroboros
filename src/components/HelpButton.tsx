import './HelpButton.css'
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

// A small, faded "?" that opens a little info dialog explaining a concept. Use it next to a label
// for anything non-obvious (CLAUDE.md §2): hover tooltips cover quick hints, this is for the cases
// that need a sentence or two. Reuses the TilingPicker modal pattern (portal + Escape + backdrop +
// focus management), sized down for a short explainer.
type Props = {
  title: string
  children: ReactNode
}

export function HelpButton({ title, children }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="help-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`About ${title}`}
        title={`About ${title}`}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <HelpDialog title={title} triggerRef={triggerRef} onClose={() => setOpen(false)}>
          {children}
        </HelpDialog>
      )}
    </>
  )
}

function HelpDialog({
  title,
  triggerRef,
  onClose,
  children,
}: {
  title: string
  triggerRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Move focus into the dialog on open; restore it to the trigger on close. The trigger node is
  // stable for the button's life, so capture it at setup for use in cleanup.
  useEffect(() => {
    const trigger = triggerRef.current
    dialogRef.current?.focus()
    return () => trigger?.focus()
  }, [triggerRef])

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
      className="help-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="help-dialog-head">
          <h2 id={titleId} className="help-dialog-title">
            {title}
          </h2>
          <button type="button" className="help-dialog-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="help-dialog-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
