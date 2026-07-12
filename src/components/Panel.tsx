import './Panel.css'
import { useState, type ReactNode } from 'react'

// A docked, collapsible workspace panel. Expanded it shows a header (title + collapse
// control) and its body; collapsed it shrinks to a thin rail that reclaims space for the
// canvas. `side` only affects the chevron direction.
//
// Collapse is controllable: pass `collapsed` + `onCollapsedChange` to drive it from a parent (the
// Workspace does, to enforce one-open-per-side). Omit them and the panel manages its own state,
// seeded by `defaultCollapsed`.
type Props = {
  title: string
  side?: 'left' | 'right'
  defaultCollapsed?: boolean
  collapsed?: boolean
  onCollapsedChange?: (next: boolean) => void
  // Expanded width variant: `wide` panels take twice the normal width (for content-heavy docks).
  // Ignored while collapsed (a rail is always thin).
  wide?: boolean
  // `fill` lets the body (and a `.predicate-pane` child) grow to the panel's full height — for the
  // editor docks whose textarea should stretch. Kept separate from `wide` so plain wide panels don't
  // inherit the fill layout.
  fill?: boolean
  // Optional tutorial anchor id — sets `data-tut` on the panel root (in BOTH the collapsed rail and
  // expanded states) so the guided overlay can spotlight the dock even while it's a thin rail.
  tut?: string
  // Optional tutorial anchor on the HEADER (title row / collapse button) of the expanded panel — so the
  // overlay can spotlight "the whole title bar" (e.g. teach the user to collapse the pane).
  tutHead?: string
  children: ReactNode
}

export function Panel({
  title,
  side = 'right',
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  wide = false,
  fill = false,
  tut,
  tutHead,
  children,
}: Props) {
  const [internal, setInternal] = useState(defaultCollapsed)
  const collapsed = collapsedProp ?? internal
  const setCollapsed = (next: boolean) => {
    if (collapsedProp === undefined) setInternal(next)
    onCollapsedChange?.(next)
  }
  const cls = `panel panel--${side}${wide ? ' panel--wide' : ''}${fill ? ' panel--fill' : ''}`

  if (collapsed) {
    return (
      <div className={`${cls} is-collapsed`} data-tut={tut}>
        <button
          type="button"
          className="panel-rail"
          aria-expanded={false}
          aria-label={`Expand ${title}`}
          onClick={() => setCollapsed(false)}
        >
          <span className="panel-rail-title">{title}</span>
        </button>
      </div>
    )
  }

  return (
    <div className={cls} data-tut={tut}>
      <button
        type="button"
        className="panel-head"
        data-tut={tutHead}
        aria-expanded={true}
        aria-label={`Collapse ${title}`}
        onClick={() => setCollapsed(true)}
      >
        <span className="panel-title">{title}</span>
        <span className="panel-collapse" aria-hidden="true">
          {side === 'left' ? '‹' : '›'}
        </span>
      </button>
      <div className="panel-body">{children}</div>
    </div>
  )
}
