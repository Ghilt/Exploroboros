import { render, fireEvent, screen, cleanup, within } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { HelpButton } from './HelpButton'

afterEach(cleanup)

describe('HelpButton', () => {
  it('opens a dialog with the title and content on click', () => {
    render(
      <HelpButton title="Registries">
        <p>Free-form counters.</p>
      </HelpButton>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /about registries/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Registries')).toBeTruthy()
    expect(within(dialog).getByText(/free-form counters/i)).toBeTruthy()
  })

  it('closes on Escape, the × button, and a backdrop click', () => {
    render(
      <HelpButton title="Steps">
        <p>About steps.</p>
      </HelpButton>,
    )
    const open = () => fireEvent.click(screen.getByRole('button', { name: /about steps/i }))

    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    open()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).toBeNull()

    open()
    // The backdrop is the dialog's parent overlay; a mousedown straight on it closes.
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
