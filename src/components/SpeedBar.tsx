import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import './SpeedBar.css'

// The four traverser speeds, slowest (turtle) → fastest (rabbit). 'max' runs one tick per animation
// frame; the other three are interval paces (their ms live in Workspace's SPEED_MS). Kept as a plain
// ordered tuple so the slider is just an index into it.
const SPEED_STOPS = ['vslow', 'slow', 'fast', 'max'] as const
export type SpeedStop = (typeof SPEED_STOPS)[number]

const SPEED_LABEL: Record<SpeedStop, string> = {
  vslow: 'very slow',
  slow: 'slow',
  fast: 'fast',
  max: 'max',
}

interface SpeedBarProps {
  value: SpeedStop
  onChange: (value: SpeedStop) => void
  ariaLabel?: string
}

// A notched speed slider: a hairline rail with four evenly-spaced notches and a round thumb, flanked by
// a turtle (slowest) and a rabbit (fastest). Click a notch, click/drag anywhere on the rail (snaps to
// the nearest of four), or arrow-key one notch at a time. role="slider" so it reads as a discrete
// slider to assistive tech. Pure / no Konva, so it unit-tests in jsdom like the other primitives.
export function SpeedBar({ value, onChange, ariaLabel = 'speed' }: SpeedBarProps) {
  const index = Math.max(0, SPEED_STOPS.indexOf(value))
  const last = SPEED_STOPS.length - 1
  const railRef = useRef<HTMLDivElement>(null)

  const setIndex = (i: number) => {
    const clamped = Math.min(last, Math.max(0, i))
    if (clamped !== index) onChange(SPEED_STOPS[clamped])
  }

  // Map a pointer x onto the nearest notch, using the rail's real geometry (its ends are notch 0 and
  // notch last). A zero-width rect (jsdom) is a no-op.
  const snapToPointer = (clientX: number) => {
    const rect = railRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setIndex(Math.round(((clientX - rect.left) / rect.width) * last))
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex(index + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex(index - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setIndex(last)
    }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    snapToPointer(e.clientX)
  }

  // Notch/thumb centres sit inset half a thumb-width from each end so the extremes don't clip; the rail
  // is inset to match, so pointer maths and visuals share the same span.
  const posFor = (i: number) => `calc(0.5rem + (100% - 1rem) * ${i / last})`

  return (
    <div className="speedbar">
      <TurtleIcon />
      <div
        className="speedbar-track"
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={SPEED_LABEL[value]}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          if (e.buttons === 1) snapToPointer(e.clientX)
        }}
      >
        <div ref={railRef} className="speedbar-rail" aria-hidden="true" />
        {SPEED_STOPS.map((stop, i) => (
          <button
            key={stop}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={`speedbar-notch${i === index ? ' is-active' : ''}`}
            style={{ left: posFor(i) }}
            title={SPEED_LABEL[stop]}
            onClick={(e) => {
              e.stopPropagation()
              setIndex(i)
            }}
          />
        ))}
        <span className="speedbar-thumb" aria-hidden="true" style={{ left: posFor(index) }} />
      </div>
      <RabbitIcon />
    </div>
  )
}

// Small stylised line icons in the app's icon idiom (24×24, fill=none, stroke=currentColor, round
// joins — cf. TrashButton / the ExportMenu chain-link). Silhouette-level detail; refine paths freely.
function TurtleIcon() {
  return (
    <svg className="speedbar-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <ellipse cx="12" cy="13" rx="6.5" ry="5.5" />
      <circle cx="12" cy="4.4" r="2" />
      <path d="M7 9 L4.5 7 M17 9 L19.5 7 M7 17 L4.5 19 M17 17 L19.5 19 M12 18.5 L12 21" />
    </svg>
  )
}

function RabbitIcon() {
  return (
    <svg className="speedbar-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <ellipse cx="10.5" cy="16" rx="5" ry="5.5" />
      <circle cx="15.5" cy="10.8" r="3.2" />
      <ellipse cx="14" cy="4.6" rx="1.3" ry="3.6" transform="rotate(-14 14 4.6)" />
      <ellipse cx="17.6" cy="4.9" rx="1.3" ry="3.6" transform="rotate(10 17.6 4.9)" />
      <circle cx="5.6" cy="17" r="1.5" />
    </svg>
  )
}
