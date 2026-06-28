import './Panel.css'
import { useState, type ReactNode } from 'react'

// A docked, collapsible workspace panel. Expanded it shows a header (title + collapse
// control) and its body; collapsed it shrinks to a thin rail that reclaims space for the
// canvas. `side` only affects the chevron direction.
type Props = {
  title: string
  side?: 'left' | 'right'
  defaultCollapsed?: boolean
  // Expanded width variant: `wide` panels take twice the normal width (for content-heavy docks like
  // the traverser editor). Ignored while collapsed (a rail is always thin).
  wide?: boolean
  children: ReactNode
}

export function Panel({ title, side = 'right', defaultCollapsed = false, wide = false, children }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const cls = `panel panel--${side}${wide ? ' panel--wide' : ''}`

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
      <header className="panel-head">
        <span className="panel-title">{title}</span>
        <button
          type="button"
          className="panel-collapse"
          aria-expanded={true}
          aria-label={`Collapse ${title}`}
          onClick={() => setCollapsed(true)}
        >
          {side === 'left' ? '‹' : '›'}
        </button>
      </header>
      <div className="panel-body">{children}</div>
    </div>
  )
}
