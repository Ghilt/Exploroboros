import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './SegmentedControl.css'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: ReadonlyArray<SegmentOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  // sm = toolbar height (--control-h); md = a touch taller for in-pane use.
  size?: 'sm' | 'md'
  // Drop the outer border/background so it nests inside another bordered shell (e.g. the transport).
  embedded?: boolean
}

// A segmented control: a few mutually-exclusive values shown side by side so the choice — and the
// current selection — are visible at a glance (the app's "don't hide state" rule). Use it instead of
// a cycling chip or a dropdown when there are ≤ ~4 options.
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'sm',
  embedded = false,
}: SegmentedControlProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const move = (delta: number) => {
    const next = (index + delta + options.length) % options.length
    onChange(options[next].value)
  }

  // The sliding indicator is sized/positioned from the SELECTED segment's real geometry, so its fill
  // lands exactly on the dividers even though segments are sized to their (unequal) labels.
  const shellRef = useRef<HTMLDivElement>(null)
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const measure = () => {
      const sel = shell.querySelector('[role="radio"][aria-checked="true"]') as HTMLElement | null
      if (sel) setInd({ left: sel.offsetLeft, width: sel.offsetWidth })
    }
    measure()
    // Recompute when the control resizes (window/layout changes). Guard for jsdom (tests).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) ro.observe(shell)
    return () => ro?.disconnect()
  }, [value, options])

  const cls = ['seg-shell', `seg-shell--${size}`, embedded ? 'seg-shell--embedded' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={shellRef} className={cls} role="radiogroup" aria-label={ariaLabel}>
      <span
        className="seg-indicator"
        aria-hidden="true"
        style={ind ? { width: ind.width, transform: `translateX(${ind.left}px)` } : { opacity: 0 }}
      />
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`seg-item seg-item--btn seg-radio${selected ? ' is-selected' : ''}`}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(-1)
              }
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
