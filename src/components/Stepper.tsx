import './Stepper.css'

interface StepperProps {
  value: number
  onStep: (delta: number) => void
  // Accessible name for the control (e.g. "visited"); the ± buttons derive their labels from it.
  label: string
  min?: number
  max?: number
  // Override how the value reads (e.g. "—" for a mixed multi-selection). Defaults to the number.
  display?: string
  // Extra classes on the value cell (lets callers/tests target a specific stepper's readout).
  valueClassName?: string
}

// A compact, connected − value + control. Sized for a single digit (0–9) so it keeps a tidy fixed
// width and never reflows as the number changes. The sleek control used throughout the Inspect dock.
export function Stepper({ value, onStep, label, min, max, display, valueClassName }: StepperProps) {
  const atMin = min !== undefined && value <= min
  const atMax = max !== undefined && value >= max
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onStep(-1)}
        disabled={atMin}
        aria-label={`decrease ${label}`}
      >
        −
      </button>
      <span className={`stepper-value${valueClassName ? ` ${valueClassName}` : ''}`}>{display ?? value}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onStep(1)}
        disabled={atMax}
        aria-label={`increase ${label}`}
      >
        +
      </button>
    </span>
  )
}
