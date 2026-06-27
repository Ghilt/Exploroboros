import './Panel.css'
import { useState, type ReactNode } from 'react'

// A docked, collapsible workspace panel. Expanded it shows a header (title + collapse
// control) and its body; collapsed it shrinks to a thin rail that reclaims space for the
// canvas. `side` only affects the chevron direction.
type Props = {
  title: string
  side?: 'left' | 'right'
  defaultCollapsed?: boolean
  children: ReactNode
}

export function Panel({ title, side = 'right', defaultCollapsed = false, children }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (collapsed) {
    return (
      <div className={`panel panel--${side} is-collapsed`}>
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
    <div className={`panel panel--${side}`}>
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
