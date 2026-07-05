import './TrashButton.css'

// A flat dice button — randomizes the colour it sits beside (a flat colour or a ramp stop). Shares
// the icon-button styling with TrashButton.
export function DiceButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
        <rect x="4" y="4" width="16" height="16" rx="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="9" cy="9" r="1.4" fill="currentColor" />
        <circle cx="15" cy="9" r="1.4" fill="currentColor" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
        <circle cx="9" cy="15" r="1.4" fill="currentColor" />
        <circle cx="15" cy="15" r="1.4" fill="currentColor" />
      </svg>
    </button>
  )
}
