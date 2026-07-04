import { render, fireEvent, screen, cleanup, within } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

afterEach(cleanup)

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      title="Replace your current work?"
      message="This can't be undone."
      confirmLabel="Replace"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('renders the title, message, and both action buttons', () => {
    setup()
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Replace your current work?')).toBeTruthy()
    expect(within(dialog).getByText(/can't be undone/i)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Replace' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('calls onConfirm when the confirm button is clicked', () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel on the cancel button, Escape, and a backdrop click', () => {
    const { onConfirm, onCancel } = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)

    // The backdrop is the dialog's parent overlay; a mousedown straight on it cancels.
    const overlay = screen.getByRole('alertdialog').parentElement as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onCancel).toHaveBeenCalledTimes(3)

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('honours a custom cancel label', () => {
    setup({ cancelLabel: 'Keep my work' })
    expect(screen.getByRole('button', { name: 'Keep my work' })).toBeTruthy()
  })
})
