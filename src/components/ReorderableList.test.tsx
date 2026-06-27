import { useState } from 'react'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { ReorderableList } from './ReorderableList'

afterEach(cleanup)

function Harness() {
  const [items, setItems] = useState([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  return (
    <>
      <div data-testid="order">{items.map((i) => i.id).join(',')}</div>
      <ReorderableList
        items={items}
        onReorder={(from, to) =>
          setItems((prev) => {
            const next = [...prev]
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            return next
          })
        }
        renderItem={(item, handle) => (
          <div>
            <span>{item.id}</span>
            <button {...handle} aria-label={`drag ${item.id}`}>
              ⠿
            </button>
          </div>
        )}
      />
    </>
  )
}

describe('ReorderableList', () => {
  it('reorders via pointer drag (touch + mouse)', () => {
    render(<Harness />)
    expect(screen.getByTestId('order').textContent).toBe('a,b,c')
    const handle = screen.getByLabelText('drag a')
    // jsdom reports 0-height rows, so the drag step is the ~6px gap fallback — move ~1 row down.
    fireEvent.pointerDown(handle, { clientY: 0, pointerType: 'touch' })
    fireEvent.pointerMove(handle, { clientY: 7, pointerType: 'touch' })
    fireEvent.pointerUp(handle, { clientY: 7, pointerType: 'touch' })
    expect(screen.getByTestId('order').textContent).toBe('b,a,c')
  })

  it('does not reorder when the drag stays within a row', () => {
    render(<Harness />)
    const handle = screen.getByLabelText('drag a')
    fireEvent.pointerDown(handle, { clientY: 0 })
    fireEvent.pointerMove(handle, { clientY: 1 })
    fireEvent.pointerUp(handle, { clientY: 1 })
    expect(screen.getByTestId('order').textContent).toBe('a,b,c')
  })
})
