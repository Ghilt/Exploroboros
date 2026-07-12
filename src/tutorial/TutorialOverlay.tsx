import './TutorialOverlay.css'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Bubble, Region } from './script'
import type { TutorialController } from './useTutorialController'
import type { ScreenRect } from './types'
import { Fireworks } from './Fireworks'

// The guided overlay. Two things are DECOUPLED:
//   • what's VISIBLE (undimmed) — the `reveal` regions + the hole, punched out of a dim layer via an
//     SVG mask, so the user can e.g. watch the whole canvas while only the Step button is interactive.
//   • what's CLICKABLE — a transparent click-catcher with a gap only at the `hole`; everything else is
//     click-blocked (whether dimmed or not). Narration steps have no hole → the whole catcher advances.
// Positions are measured from the live DOM (via data-tut) each frame + on change, so holes/bubbles track
// pane open/close, scroll, resize (→ mobile-responsive). The spotlight TILE has no DOM node, so its rect
// is reported by the canvas (tileRect prop).

type Rect = { left: number; top: number; width: number; height: number }
type Placed = { style: CSSProperties; tail: 'left' | 'right' | 'top' | 'bottom' | 'none' }
type Layout = { hole: Rect | null; reveals: Rect[]; ring: Rect | null; bubbles: Placed[] }

const DIM_OPACITY = 0.22
const REVEAL_PAD = 6 // breathing room around a revealed region / the ring
const GAP = 14
const MARGIN = 12
const EST_W = 300
const EST_H = 150

function rectOf(sel: string): Rect | null {
  const el = document.querySelector(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function resolveRegion(region: Region): Rect | null {
  return region === 'canvas' ? rectOf('[data-tut="canvas"]') : rectOf(`[data-tut="${region.tut}"]`)
}

function holeRectFor(hole: 'none' | 'canvas' | { tut: string }): Rect | null {
  if (hole === 'none') return null
  return resolveRegion(hole)
}

function autoPlacement(r: Rect, vw: number): 'left' | 'right' | 'bottom' | 'top' {
  const roomRight = vw - (r.left + r.width)
  if (roomRight > r.left && roomRight > EST_W) return 'right'
  if (r.left > EST_W) return 'left'
  return 'bottom'
}

function placeBubble(bubble: Bubble): Placed {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const center: Placed = { style: { left: vw / 2, top: vh * 0.46, transform: 'translate(-50%,-50%)' }, tail: 'none' }

  if (bubble.anchor === 'center') return center
  if (bubble.anchor === 'canvas-top') {
    const c = rectOf('[data-tut="canvas"]')
    if (!c) return center
    return {
      style: { left: c.left + c.width / 2, top: c.top + Math.min(c.height * 0.1, 84), transform: 'translate(-50%,0)' },
      tail: 'none',
    }
  }

  const r = rectOf(`[data-tut="${bubble.anchor.tut}"]`)
  if (!r) return center
  const right = r.left + r.width
  let placement = bubble.placement ?? autoPlacement(r, vw)
  if (placement === 'right' && right + GAP + EST_W > vw - MARGIN && r.left - GAP - EST_W > MARGIN) placement = 'left'
  else if (placement === 'left' && r.left - GAP - EST_W < MARGIN && right + GAP + EST_W < vw - MARGIN) placement = 'right'
  else if (placement === 'bottom' && r.top + r.height + GAP + EST_H > vh - MARGIN && r.top - GAP - EST_H > MARGIN) placement = 'top'
  else if (placement === 'top' && r.top - GAP - EST_H < MARGIN && r.top + r.height + GAP + EST_H < vh - MARGIN) placement = 'bottom'

  const clampX = (x: number) => Math.max(MARGIN + EST_W / 2, Math.min(vw - MARGIN - EST_W / 2, x))
  const clampY = (y: number) => Math.max(MARGIN + EST_H / 2, Math.min(vh - MARGIN - EST_H / 2, y))
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  switch (placement) {
    case 'right':
      return { style: { left: r.left + r.width + GAP, top: clampY(cy), transform: 'translateY(-50%)' }, tail: 'left' }
    case 'left':
      return { style: { left: r.left - GAP, top: clampY(cy), transform: 'translate(-100%,-50%)' }, tail: 'right' }
    case 'top':
      return { style: { left: clampX(cx), top: r.top - GAP, transform: 'translate(-50%,-100%)' }, tail: 'bottom' }
    default:
      return { style: { left: clampX(cx), top: r.top + r.height + GAP, transform: 'translate(-50%,0)' }, tail: 'top' }
  }
}

function computeLayout(step: TutorialController['step'], tileRect: ScreenRect | null): Layout {
  const hole = holeRectFor(step.hole)
  const reveals: Rect[] = []
  if (hole) reveals.push(hole)
  for (const region of step.reveal ?? []) {
    const r = resolveRegion(region)
    if (r) reveals.push(r)
  }
  const ringMode = step.ring ?? 'hole'
  const ring = ringMode === 'none' ? null : ringMode === 'tile' ? tileRect : hole
  return { hole, reveals, ring, bubbles: step.bubbles.map(placeBubble) }
}

function layoutKey(l: Layout): string {
  const box = (r: Rect | null) => (r ? `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}` : 'x')
  const reveals = l.reveals.map(box).join(';')
  const bubbles = l.bubbles.map((p) => `${p.tail}:${String(p.style.left)}:${String(p.style.top)}:${String(p.style.transform)}`).join('|')
  return `${box(l.hole)}#${reveals}#${box(l.ring)}#${bubbles}`
}

export function TutorialOverlay({
  controller,
  onExit,
  tileRect,
}: {
  controller: TutorialController
  onExit: () => void
  tileRect: ScreenRect | null
}) {
  const { step, message, isFinale, onOverlayClick } = controller
  const [layout, setLayout] = useState<Layout>(() => ({ hole: null, reveals: [], ring: null, bubbles: [] }))
  // One DOM ref per currently-rendered bubble, so a click can be geometrically tested against each
  // bubble's live rect without changing the bubble's own pointer-events (it stays click-through).
  const bubbleRefs = useRef<Array<HTMLDivElement | null>>([])

  // Measure synchronously first (so nothing waits a frame / works on a throttled tab), then per-rAF.
  // Re-runs when the step or the reported tile rect changes.
  useEffect(() => {
    let raf = 0
    let prevKey = ''
    const measure = () => {
      const next = computeLayout(step, tileRect)
      const key = layoutKey(next)
      if (key !== prevKey) {
        prevKey = key
        setLayout(next)
      }
    }
    measure()
    const loop = () => {
      measure()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [step, tileRect])

  // Silently copies the clicked bubble's payload (its code sample if it has one, else its plain text)
  // to the clipboard. Purely a side effect — it never changes what a click on the overlay already does.
  const copyBubbleAt = (pt: { clientX: number; clientY: number }) => {
    const bubbles = bubbleRefs.current
    for (let i = 0; i < bubbles.length; i += 1) {
      const el = bubbles[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (pt.clientX < r.left || pt.clientX > r.right || pt.clientY < r.top || pt.clientY > r.bottom) continue
      const b = step.bubbles[i]
      if (!b) continue
      navigator.clipboard?.writeText(b.code ?? b.text).catch(() => {})
      break
    }
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const hole = layout.hole

  // The click-catcher: four transparent rects framing the hole (the gap passes clicks through to the real
  // UI); one full-screen rect for a narration step (no hole → click anywhere advances).
  const catchers = hole
    ? [
        { left: 0, top: 0, width: vw, height: Math.max(0, hole.top - REVEAL_PAD) },
        { left: 0, top: hole.top + hole.height + REVEAL_PAD, width: vw, height: Math.max(0, vh - (hole.top + hole.height + REVEAL_PAD)) },
        { left: 0, top: hole.top - REVEAL_PAD, width: Math.max(0, hole.left - REVEAL_PAD), height: hole.height + 2 * REVEAL_PAD },
        { left: hole.left + hole.width + REVEAL_PAD, top: hole.top - REVEAL_PAD, width: Math.max(0, vw - (hole.left + hole.width + REVEAL_PAD)), height: hole.height + 2 * REVEAL_PAD },
      ]
    : [{ left: 0, top: 0, width: vw, height: vh }]

  return createPortal(
    <div className="tut-overlay" role="dialog" aria-modal="true" aria-label="Tutorial">
      {/* Visual dim — full screen, with the reveal regions punched transparent via a mask. Pointer-events
          are off here; the catchers below own click handling. */}
      <svg className="tut-dim-svg" width={vw} height={vh} aria-hidden="true">
        <defs>
          <mask id="tut-reveal-mask">
            <rect x={0} y={0} width={vw} height={vh} fill="white" />
            {layout.reveals.map((r, i) => (
              <rect key={i} x={r.left - REVEAL_PAD} y={r.top - REVEAL_PAD} width={r.width + 2 * REVEAL_PAD} height={r.height + 2 * REVEAL_PAD} rx={10} ry={10} fill="black" />
            ))}
          </mask>
        </defs>
        <rect x={0} y={0} width={vw} height={vh} fill="#000" fillOpacity={DIM_OPACITY} mask="url(#tut-reveal-mask)" />
      </svg>

      {catchers.map((c, i) => (
        <div
          key={i}
          className="tut-catch"
          style={{ left: c.left, top: c.top, width: c.width, height: c.height }}
          onClick={(e) => {
            copyBubbleAt(e)
            onOverlayClick()
          }}
        />
      ))}

      {layout.ring && (
        <div
          className="tut-ring"
          style={{ left: layout.ring.left - REVEAL_PAD, top: layout.ring.top - REVEAL_PAD, width: layout.ring.width + 2 * REVEAL_PAD, height: layout.ring.height + 2 * REVEAL_PAD }}
        />
      )}

      {step.bubbles.map((b, i) => {
        const placed = layout.bubbles[i]
        if (!placed) return null
        return (
          <div
            key={i}
            ref={(el) => {
              bubbleRefs.current[i] = el
            }}
            className={`tut-bubble tut-tail-${placed.tail}`}
            style={placed.style}
          >
            {isFinale && (
              <div className="tut-finale-check" aria-hidden="true">
                <span>✓</span>
              </div>
            )}
            {b.text.split('\n\n').map((para, j) => (
              <p key={j}>{para}</p>
            ))}
            {b.code && <pre className="tut-code">{b.code}</pre>}
            {step.narration && <span className="tut-continue">click to continue →</span>}
          </div>
        )
      })}

      {message && <div className="tut-message" role="status">{message}</div>}

      {isFinale && <Fireworks />}

      <button type="button" className="tut-exit" onClick={onExit} aria-label="Exit the tutorial">
        ✕ Exit tutorial
      </button>
    </div>,
    document.body,
  )
}
