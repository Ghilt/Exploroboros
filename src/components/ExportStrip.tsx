import './ExportStrip.css'

// An exported image held in memory for the session: object URLs for the full PNG (with embedded
// recipe metadata) and a small thumbnail, plus the blob for (re)download. Workspace owns the list and
// the URL lifecycle (revokes on remove / cap-eviction / unmount).
export type ExportItem = {
  id: string
  fullUrl: string
  thumbUrl: string
  full: Blob
  width: number
  height: number
  filename: string
  hitCap: boolean
}

type Props = {
  items: ReadonlyArray<ExportItem>
  viewingId: string | null
  onView: (id: string) => void
  onReturn: () => void
  onDownload: (item: ExportItem) => void
  onRemove: (id: string) => void
}

// The thumbnail strip overlaid bottom-right of the canvas stage. Each export stacks here for the
// session; clicking one opens it in the viewer. While viewing, a "grid" chip returns to the live canvas.
export function ExportStrip({ items, viewingId, onView, onReturn, onDownload, onRemove }: Props) {
  if (items.length === 0) return null
  return (
    <div className="export-strip">
      {items.map((item) => (
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
      ))}

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
