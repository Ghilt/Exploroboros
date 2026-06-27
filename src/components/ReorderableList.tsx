import './ReorderableList.css'
import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

// A hand-rolled drag-to-reorder list that works on touch and mouse (Pointer Events + capture, like
// the canvas). No dependency. The consumer renders each row and spreads `handle` onto a drag handle;
// the dragged row follows the pointer and, on release, the list reorders from→to. Reusable for any
// list of items carrying a stable `id` (coloring rules now, traversers later).

export type DragHandleProps = {
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  className: string
}

type Props<T extends { id: string }> = {
  items: ReadonlyArray<T>
  onReorder: (from: number, to: number) => void
  renderItem: (item: T, handle: DragHandleProps) => ReactNode
  className?: string
}

type Drag = { id: string; index: number; startY: number; dy: number; rowH: number }

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)

export function ReorderableList<T extends { id: string }>({ items, onReorder, renderItem, className }: Props<T>) {
  const [drag, setDrag] = useState<Drag | null>(null)

  const targetIndex = drag ? clamp(drag.index + Math.round(drag.dy / drag.rowH), 0, items.length - 1) : -1

  const down = (e: ReactPointerEvent, index: number, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return // left button / touch / pen only
    const row = (e.currentTarget as HTMLElement).closest('[data-reorder-row]')
    const rowH = row ? row.getBoundingClientRect().height + 6 : 40 // + approx gap
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort */
    }
    setDrag({ id, index, startY: e.clientY, dy: 0, rowH })
    e.preventDefault()
  }
  const move = (e: ReactPointerEvent) => {
    setDrag((d) => (d ? { ...d, dy: e.clientY - d.startY } : d))
  }
  const up = (e: ReactPointerEvent) => {
    if (drag) {
      const to = clamp(drag.index + Math.round(drag.dy / drag.rowH), 0, items.length - 1)
      if (to !== drag.index) onReorder(drag.index, to)
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    setDrag(null)
  }

  return (
    <ul className={`reorder-list${className ? ` ${className}` : ''}`}>
      {items.map((item, index) => {
        const dragging = drag?.id === item.id
        const isTarget = !!drag && !dragging && index === targetIndex
        return (
          <li
            key={item.id}
            data-reorder-row
            className={`reorder-row${dragging ? ' is-dragging' : ''}${isTarget ? ' is-drop-target' : ''}`}
            style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
          >
            {renderItem(item, {
              onPointerDown: (e) => down(e, index, item.id),
              onPointerMove: move,
              onPointerUp: up,
              className: 'reorder-handle',
            })}
          </li>
        )
      })}
    </ul>
  )
}
