import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Stepper } from './Stepper'

afterEach(cleanup)

describe('Stepper', () => {
  it('renders the value and labelled ± buttons', () => {
    render(<Stepper value={4} onStep={() => {}} label="count" />)
    expect(screen.getByRole('group', { name: 'count' }).textContent).toContain('4')
    expect(screen.getByRole('button', { name: 'increase count' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'decrease count' })).toBeTruthy()
  })

  it('steps by +1 / −1', () => {
    const onStep = vi.fn()
    render(<Stepper value={4} onStep={onStep} label="count" />)
    fireEvent.click(screen.getByRole('button', { name: 'increase count' }))
    expect(onStep).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'decrease count' }))
    expect(onStep).toHaveBeenCalledWith(-1)
  })

  it('disables the buttons at min / max bounds', () => {
    const { rerender } = render(<Stepper value={0} onStep={() => {}} label="count" min={0} max={9} />)
    expect((screen.getByRole('button', { name: 'decrease count' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'increase count' }) as HTMLButtonElement).disabled).toBe(false)
    rerender(<Stepper value={9} onStep={() => {}} label="count" min={0} max={9} />)
    expect((screen.getByRole('button', { name: 'increase count' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('honours a display override (e.g. a mixed selection)', () => {
    render(<Stepper value={0} display="—" onStep={() => {}} label="count" />)
    expect(screen.getByRole('group', { name: 'count' }).textContent).toContain('—')
  })
})
