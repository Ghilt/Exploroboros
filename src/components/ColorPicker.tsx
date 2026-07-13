import { useEffect, useRef } from 'react'
import './ColorPicker.css'

// A dependency-free colour swatch: the native OS colour input (works on phone + desktop). Opacity
// lives on the whole rule now, not per colour, so this is just the hex picker. `dataTut` sets a
// `data-tut` anchor (the tutorial spotlights the flat rule's swatch); omitted everywhere else.
//
// Commit ONLY on the native `change` event (fired when the picker is dismissed), never on the
// continuous `input` event that streams while dragging in the OS picker. React's `onChange` binds to
// `input`, so using it would push every intermediate colour up to the store → re-colorize the whole
// tiling + redraw the canvas per frame, which lags the UI. So the input is uncontrolled and we wire
// our own `change` listener; `value` is synced onto the swatch when it changes from elsewhere (the
// dice button, ramp edits, reopening a creation).
export function ColorPicker({ value, onChange, label = 'colour', dataTut }: { value: string; onChange: (hex: string) => void; label?: string; dataTut?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const commit = () => onChangeRef.current(el.value)
    el.addEventListener('change', commit)
    return () => el.removeEventListener('change', commit)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (el && el.value !== value) el.value = value
  }, [value])

  return <input ref={ref} type="color" className="color-swatch" defaultValue={value} aria-label={label} data-tut={dataTut} />
}
