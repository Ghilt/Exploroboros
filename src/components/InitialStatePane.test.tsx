import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { InitialStatePane } from './InitialStatePane'
import { useInitialStateStore } from '../state/initialStateStore'

function Harness() {
  const store = useInitialStateStore()
  return <InitialStatePane store={store} predicateNames={new Map()} traverserNames={['walker']} />
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('InitialStatePane presets', () => {
  it('appends a chosen preset to the (empty) textarea', () => {
    render(<Harness />)
    const ta = screen.getByRole('textbox', { name: 'initial-state DSL' }) as HTMLTextAreaElement
    expect(ta.value).toBe('')
    fireEvent.change(screen.getByRole('combobox', { name: 'insert a preset' }), { target: { value: 'Cross' } })
    expect(ta.value).toContain('auto-place line {t1, 90, 50, 1}')
    expect(ta.value).toContain('auto-place line {t1, 0, 50, 2}')
  })

  it('a second preset appends after the first (never replaces)', () => {
    render(<Harness />)
    const combo = screen.getByRole('combobox', { name: 'insert a preset' })
    fireEvent.change(combo, { target: { value: 'Cross' } })
    fireEvent.change(combo, { target: { value: 'Diagonal cross' } })
    const ta = screen.getByRole('textbox', { name: 'initial-state DSL' }) as HTMLTextAreaElement
    expect(ta.value).toContain('auto-place line {t1, 90, 50, 1}') // from Cross
    expect(ta.value).toContain('auto-place line {t1, 45, 50, 1}') // from Diagonal cross
  })
})
