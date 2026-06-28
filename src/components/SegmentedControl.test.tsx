import { render, fireEvent, screen, cleanup, within } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

afterEach(cleanup)

const OPTS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
] as const

describe('SegmentedControl', () => {
  it('renders one radio per option, marking the selected one', () => {
    render(<SegmentedControl ariaLabel="letters" value="b" options={OPTS} onChange={() => {}} />)
    const group = within(screen.getByRole('radiogroup', { name: 'letters' }))
    expect(group.getAllByRole('radio')).toHaveLength(3)
    expect((group.getByRole('radio', { name: 'B' }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true')
    expect((group.getByRole('radio', { name: 'A' }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('false')
  })

  it('fires onChange with the clicked value', () => {
    const onChange = vi.fn()
    render(<SegmentedControl ariaLabel="letters" value="a" options={OPTS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'C' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('arrow keys move the selection (wrapping)', () => {
    const onChange = vi.fn()
    render(<SegmentedControl ariaLabel="letters" value="a" options={OPTS} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('c') // wraps to the last
    onChange.mockClear()
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
