import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ColorPicker } from './ColorPicker'

afterEach(cleanup)

describe('ColorPicker', () => {
  it('does NOT propagate on `input` (the continuous drag event that lagged the UI)', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#000000" onChange={onChange} />)
    const input = screen.getByLabelText('colour') as HTMLInputElement
    fireEvent.input(input, { target: { value: '#123456' } })
    fireEvent.input(input, { target: { value: '#654321' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('propagates once on `change` (the picker committed on release)', () => {
    const onChange = vi.fn()
    render(<ColorPicker value="#000000" onChange={onChange} />)
    const input = screen.getByLabelText('colour') as HTMLInputElement
    fireEvent.change(input, { target: { value: '#abcdef' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('#abcdef')
  })

  it('syncs the swatch when the colour changes from outside (dice, ramp edits, reopen)', () => {
    const { rerender } = render(<ColorPicker value="#000000" onChange={() => {}} />)
    const input = screen.getByLabelText('colour') as HTMLInputElement
    expect(input.value).toBe('#000000')
    rerender(<ColorPicker value="#ffffff" onChange={() => {}} />)
    expect(input.value).toBe('#ffffff')
  })
})
