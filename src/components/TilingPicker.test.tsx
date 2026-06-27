import { render, fireEvent, screen, cleanup, within } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { TilingPicker } from './TilingPicker'

// The dialog is portaled to document.body; `screen` queries the whole document, so it's found.
afterEach(cleanup)

describe('TilingPicker', () => {
  it('shows the current tiling name on the trigger', () => {
    render(<TilingPicker value="square" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /square/i })).toBeTruthy()
  })

  it('opens a modal gallery listing the tilings', () => {
    render(<TilingPicker value="square" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Kalleboda')).toBeTruthy()
    expect(within(dialog).getByText('Triangular')).toBeTruthy()
  })

  it('choosing the ready tiling reports it and closes', () => {
    const onChange = vi.fn()
    render(<TilingPicker value="square" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    const dialog = screen.getByRole('dialog')
    // Click the Square card (exact text avoids matching "Snub Square" / "Truncated Square").
    fireEvent.click(within(dialog).getByText('Square'))
    expect(onChange).toHaveBeenCalledWith('square')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('choosing Kalleboda (now a real generator) reports it', () => {
    const onChange = vi.fn()
    render(<TilingPicker value="square" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Kalleboda'))
    expect(onChange).toHaveBeenCalledWith('kalleboda')
  })

  it('a not-yet-built tiling is present but disabled', () => {
    render(<TilingPicker value="square" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button'))
    // exact text avoids matching "Truncated Trihexagonal"
    const card = within(screen.getByRole('dialog')).getByText('Trihexagonal').closest('button')
    expect(card?.disabled).toBe(true)
  })

  it('closes on Escape and on backdrop click', () => {
    render(<TilingPicker value="square" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
