import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { SpeedBar } from './SpeedBar'

afterEach(cleanup)

describe('SpeedBar', () => {
  it('exposes a labelled discrete slider reflecting the current value', () => {
    render(<SpeedBar value="slow" onChange={() => {}} ariaLabel="traverser speed" />)
    const slider = screen.getByRole('slider', { name: 'traverser speed' })
    expect(slider.getAttribute('aria-valuemin')).toBe('0')
    expect(slider.getAttribute('aria-valuemax')).toBe('3')
    expect(slider.getAttribute('aria-valuenow')).toBe('1')
    expect(slider.getAttribute('aria-valuetext')).toBe('slow')
  })

  it('arrow / Home / End keys move to the right speed and clamp at the ends', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SpeedBar value="slow" onChange={onChange} />)
    const slider = () => screen.getByRole('slider')
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('fast')
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' }) // still controlled at "slow" -> down one
    expect(onChange).toHaveBeenLastCalledWith('vslow')
    // At the slowest end, ArrowLeft is a no-op.
    rerender(<SpeedBar value="vslow" onChange={onChange} />)
    onChange.mockClear()
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(slider(), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('max')
  })

  it('clicking a notch selects that speed', () => {
    const onChange = vi.fn()
    const { container } = render(<SpeedBar value="slow" onChange={onChange} />)
    const notches = container.querySelectorAll('.speedbar-notch')
    expect(notches.length).toBe(4)
    fireEvent.click(notches[3]) // fastest end
    expect(onChange).toHaveBeenLastCalledWith('max')
    fireEvent.click(notches[0]) // slowest end
    expect(onChange).toHaveBeenLastCalledWith('vslow')
  })

  it('renders the slow and fast chevron icons', () => {
    const { container } = render(<SpeedBar value="slow" onChange={() => {}} />)
    expect(container.querySelectorAll('svg.speedbar-icon').length).toBe(2)
  })
})
