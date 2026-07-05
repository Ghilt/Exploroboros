import './TrashButton.css'

// A flat eye toggle — used to switch a coloring rule on/off without deleting it. Open eye = on,
// slashed eye = off (and dimmed). Shares the icon-button styling with TrashButton.
export function EyeButton({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`icon-btn${on ? '' : ' is-off'}`}
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
        {!on && <path d="M4 4l16 16" />}
      </svg>
    </button>
  )
}
