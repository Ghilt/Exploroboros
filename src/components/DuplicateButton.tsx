import './TrashButton.css'

// A flat "duplicate" icon button (two overlapping cards) — copies a coloring rule, inserting the copy
// directly below it. Shares the icon-button styling with the eye + trash.
export function DuplicateButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}
