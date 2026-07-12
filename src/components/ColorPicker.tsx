import './ColorPicker.css'

// A dependency-free colour swatch: the native OS colour input (works on phone + desktop). Opacity
// lives on the whole rule now, not per colour, so this is just the hex picker. `dataTut` sets a
// `data-tut` anchor (the tutorial spotlights the flat rule's swatch); omitted everywhere else.
export function ColorPicker({ value, onChange, label = 'colour', dataTut }: { value: string; onChange: (hex: string) => void; label?: string; dataTut?: string }) {
  return (
    <input
      type="color"
      className="color-swatch"
      value={value}
      aria-label={label}
      data-tut={dataTut}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
