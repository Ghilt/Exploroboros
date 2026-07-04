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
      <div className={`${cls} is-collapsed`}>
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
    <div className={cls}>
      <button
        type="button"
        className="panel-head"
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
