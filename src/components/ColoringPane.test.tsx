import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { ColoringPane } from './ColoringPane'
import { useColoringStore } from '../state/coloringStore'

function Harness() {
  const store = useColoringStore()
  return <ColoringPane store={store} customPredicates={[{ id: 'p1', name: 'My predicate' }]} />
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('ColoringPane', () => {
  it('adds a rule that references a predicate by default (no inline text box)', () => {
    render(<Harness />)
    expect(screen.getByText(/no rules yet/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    expect((screen.getByRole('combobox', { name: 'rule predicate' }) as HTMLSelectElement).value).toBe('visited')
    expect(screen.queryByRole('textbox', { name: 'inline predicate' })).toBeNull()
    expect(screen.getByLabelText('colour')).toBeTruthy() // the flat colour swatch
    expect(screen.getByRole('button', { name: 'add a colour' })).toBeTruthy()
  })

  it('adding a colour turns a flat colour into a ramp with controls', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    fireEvent.click(screen.getByRole('button', { name: 'add a colour' }))
    expect(screen.getByRole('combobox', { name: 'ramp attribute' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'ramp modulo' })).toBeTruthy()
  })

  it('caps a ramp at five colours', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    // flat -> ramp(2) on the first add, then up to 5; four adds in total
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getByRole('button', { name: 'add a colour' }))
    expect(screen.getAllByRole('button', { name: /remove stop/i })).toHaveLength(5)
    expect(screen.queryByRole('button', { name: 'add a colour' })).toBeNull()
  })

  it('the inline text box is opt-in (only when "Inline…" is chosen)', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    const select = screen.getByRole('combobox', { name: 'rule predicate' })
    expect(screen.queryByRole('textbox', { name: 'inline predicate' })).toBeNull()
    fireEvent.change(select, { target: { value: '__inline__' } })
    expect(screen.queryByRole('textbox', { name: 'inline predicate' })).not.toBeNull()
    fireEvent.change(select, { target: { value: 'p1' } })
    expect(screen.queryByRole('textbox', { name: 'inline predicate' })).toBeNull()
  })

  it('deletes a rule', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    fireEvent.click(screen.getByRole('button', { name: 'delete rule' }))
    expect(screen.getByText(/no rules yet/i)).toBeTruthy()
  })

  it('offers "Generate a random coloring" only while empty, and adds a rule on click', () => {
    render(<Harness />)
    const gen = screen.getByRole('button', { name: /generate a random coloring/i })
    expect(gen).toBeTruthy()
    fireEvent.click(gen)
    // A ramp rule was added, so a ramp attribute selector now exists (some presets add a second
    // overlay rule too, hence getAllByRole — getByRole would throw on the two-combobox case).
    expect(screen.getAllByRole('combobox', { name: 'ramp attribute' }).length).toBeGreaterThanOrEqual(1)
    // ...and the generate button is gone (the pane is no longer empty).
    expect(screen.queryByRole('button', { name: /generate a random coloring/i })).toBeNull()
    expect(screen.queryByText(/no rules yet/i)).toBeNull()
  })
})
