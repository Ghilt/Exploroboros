import './ExportStrip.css'

// An export in the strip. A job appears immediately as `running` (placeholder thumbnail, not clickable,
// spinner where the download button will be, X = cancel); when the worker finishes it flips to `done`
// (the real thumbnail, clickable to view, with download + remove). Workspace owns the list, the abort
// controllers, and the object-URL lifecycle.
export type ExportItem = {
  id: string
  status: 'running' | 'done'
  filename: string
  // Present once done:
  fullUrl?: string
  thumbUrl?: string
  full?: Blob
  width?: number
  height?: number
  hitCap?: boolean
}

type Props = {
  items: ReadonlyArray<ExportItem>
  viewingId: string | null
  onView: (id: string) => void
  onReturn: () => void
  onDownload: (item: ExportItem) => void
  // Cancels a running job, or removes a finished one.
  onRemove: (id: string) => void
}

// The thumbnail strip overlaid bottom-right of the canvas stage. Each export stacks here for the
// session. While viewing an export, a "grid" chip returns to the live canvas.
export function ExportStrip({ items, viewingId, onView, onReturn, onDownload, onRemove }: Props) {
  if (items.length === 0) return null
  return (
    <div className="export-strip">
      {items.map((item) =>
        item.status === 'running' ? (
          <div key={item.id} className="export-thumb is-running">
            <div className="export-thumb-pending" role="img" aria-label="Generating export…" />
            <div className="export-thumb-actions">
              <span className="export-job-spinner" aria-hidden="true" title="Generating…" />
              <button type="button" onClick={() => onRemove(item.id)} title="Cancel this export" aria-label="Cancel this export">
                ×
              </button>
            </div>
          </div>
        ) : (
          <div key={item.id} className={`export-thumb${item.id === viewingId ? ' is-active' : ''}`}>
            <button
              type="button"
              className="export-thumb-open"
              onClick={() => onView(item.id)}
              title={`Open ${item.width}×${item.height}px export`}
              aria-label={`Open ${item.width} by ${item.height} pixel export`}
            >
              <img src={item.thumbUrl} alt="" draggable={false} />
              {item.hitCap && <span className="export-thumb-badge" title="Run hit the tick cap — may be incomplete">!</span>}
            </button>
            <div className="export-thumb-actions">
              <button type="button" onClick={() => onDownload(item)} title="Download again" aria-label="Download this export">
                ↓
              </button>
              <button type="button" onClick={() => onRemove(item.id)} title="Remove from the strip" aria-label="Remove this export">
                ×
              </button>
            </div>
          </div>
        ),
      )}

      {viewingId && (
        <button type="button" className="export-canvas-chip" onClick={onReturn} title="Back to the live canvas" aria-label="Back to the live canvas">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span>Canvas</span>
        </button>
      )}
    </div>
  )
}
