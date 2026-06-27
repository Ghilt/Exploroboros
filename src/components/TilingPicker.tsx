import './TilingPicker.css'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { TILINGS, getTiling, type TilingEntry } from '../data/tilings'
import { TilingThumbnail } from './TilingThumbnail'

// A trigger button showing the current tiling's name; clicking opens a modal gallery of
// tilings. Only `ready` tilings can be picked; the rest are shown but disabled (the
// octagon+wedge preview included), so the gallery doubles as a roadmap.
type Props = {
  value: string
  onChange: (id: string) => void
}

export function TilingPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const current = getTiling(value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="tiling-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="tiling-picker-label">{current?.name ?? 'Select tiling'}</span>
        <span className="tiling-picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <TilingGallery
          value={value}
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          onChoose={(id) => {
            onChange(id)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function TilingGallery({
  value,
  triggerRef,
  onClose,
  onChoose,
}: {
  value: string
  triggerRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onChoose: (id: string) => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Move focus into the dialog on open; restore it to the trigger on close. The trigger node
  // is stable for the picker's life, so capture it at setup for use in cleanup.
  useEffect(() => {
    const trigger = triggerRef.current
    dialogRef.current?.focus()
    return () => trigger?.focus()
  }, [triggerRef])

  // Escape closes; lock body scroll so only the gallery scrolls beneath the fade.
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
      className="tiling-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="tiling-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <header className="tiling-dialog-head">
          <h2 id={titleId} className="tiling-dialog-title">
            Choose a tiling
          </h2>
          <button type="button" className="tiling-dialog-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="tiling-gallery">
          {TILINGS.map((entry) => (
            <TilingCard key={entry.id} entry={entry} selected={entry.id === value} onChoose={onChoose} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function TilingCard({
  entry,
  selected,
  onChoose,
}: {
  entry: TilingEntry
  selected: boolean
  onChoose: (id: string) => void
}) {
  const ready = entry.status === 'ready'
  const badge = entry.status === 'preview' ? 'Soon' : entry.status === 'planned' ? 'Planned' : null

  return (
    <button
      type="button"
      className={`tiling-card status-${entry.status}${selected ? ' is-current' : ''}`}
      disabled={!ready}
      aria-current={selected || undefined}
      title={ready ? undefined : 'Not implemented yet'}
      onClick={ready ? () => onChoose(entry.id) : undefined}
    >
      <span className="tiling-card-media">
        <span className="tiling-card-thumb" aria-hidden="true">
          <TilingThumbnail entry={entry} />
        </span>
        {selected && <span className="tiling-card-flag" aria-hidden="true">current</span>}
        {badge && <span className="tiling-card-badge">{badge}</span>}
      </span>
      <span className="tiling-card-cap">
        <span className="tiling-card-name">{entry.name}</span>
        <span className="tiling-card-config">{entry.vertexConfig}</span>
      </span>
    </button>
  )
}
