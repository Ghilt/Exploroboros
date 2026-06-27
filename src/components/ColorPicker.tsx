import './ColorPicker.css'

// A dependency-free colour swatch: the native OS colour input (works on phone + desktop). Opacity
// lives on the whole rule now, not per colour, so this is just the hex picker.
export function ColorPicker({ value, onChange, label = 'colour' }: { value: string; onChange: (hex: string) => void; label?: string }) {
  return (
    <input
      type="color"
      className="color-swatch"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
