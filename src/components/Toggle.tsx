import './Toggle.css'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

// A binary on/off switch — a compact track + knob. Use for true two-state settings; for three or
// more mutually-exclusive values use a SegmentedControl, and for many use a dropdown.
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" aria-hidden="true" />
    </button>
  )
}
