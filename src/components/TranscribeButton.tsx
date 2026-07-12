import './TrashButton.css'

// The "transcribe a canvas drag into a DSL path" button — a 2×2 grid of tiles with an arrow leaving the
// top-right (capture the grid → a path). Same inline-SVG idiom as DiceButton (the grid) + SpeedBar (the
// stroked arrow). Reuses the shared `.icon-btn` style; `active` highlights it while transcribe mode is on.
export function TranscribeButton({
  onClick,
  active,
  label,
  className,
}: {
  onClick: () => void
  active?: boolean
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-btn${className ? ` ${className}` : ''}${active ? ' is-active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {/* 2×2 grid of tiles */}
        <rect x="3" y="11" width="4.4" height="4.4" rx="1" />
        <rect x="9" y="11" width="4.4" height="4.4" rx="1" />
        <rect x="3" y="17" width="4.4" height="4.4" rx="1" />
        <rect x="9" y="17" width="4.4" height="4.4" rx="1" />
        {/* an arrow leaving the top-right, pointing up-and-out */}
        <line x1="12" y1="11" x2="20.5" y2="3.5" />
        <polyline points="15,3.5 20.5,3.5 20.5,9" />
      </svg>
    </button>
  )
}
