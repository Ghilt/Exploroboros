import './ChipPopover.css'
import { useEffect, useRef, useState } from 'react'

export type ChipOption = { id: string; label: string; accel?: string }

// A small inline dropdown anchored under a chip. Mouse-driven (click an option) and keyboard-driven:
// arrows move the highlight, Enter picks it, Escape closes, and an option's accelerator key picks it
// directly (e.g. press "-" to choose subtract). Closes when focus leaves it.
export function ChipPopover({
  options,
  onSelect,
  onClose,
}: {
  options: ReadonlyArray<ChipOption>
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % options.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + options.length) % options.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onSelect(options[active].id)
      return
    }
    const hit = options.find((o) => o.accel === e.key)
    if (hit) {
      e.preventDefault()
      onSelect(hit.id)
    }
  }

  return (
    <div
      className="chip-popover"
      role="listbox"
      tabIndex={-1}
      ref={ref}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node | null)) onClose()
      }}
    >
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="option"
          aria-selected={i === active}
          className={`chip-option${i === active ? ' is-active' : ''}`}
          onMouseEnter={() => setActive(i)}
          onClick={() => onSelect(o.id)}
        >
          <span className="chip-option-label">{o.label}</span>
          {o.accel && <kbd className="chip-option-key">{o.accel}</kbd>}
        </button>
      ))}
    </div>
  )
}
