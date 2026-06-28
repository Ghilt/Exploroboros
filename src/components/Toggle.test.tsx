import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Toggle } from './Toggle'

afterEach(cleanup)

describe('Toggle', () => {
  it('exposes a labelled switch reflecting checked state', () => {
    render(<Toggle checked onChange={() => {}} label="edges" />)
    const sw = screen.getByRole('switch', { name: 'edges' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
  })

  it('toggles to the opposite value on click', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Toggle checked={false} onChange={onChange} label="edges" />)
    fireEvent.click(screen.getByRole('switch', { name: 'edges' }))
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<Toggle checked onChange={onChange} label="edges" />)
    fireEvent.click(screen.getByRole('switch', { name: 'edges' }))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
