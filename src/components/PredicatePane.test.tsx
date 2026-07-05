import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { PredicatePane } from './PredicatePane'
import { usePredicateStore } from '../state/predicateStore'

// PredicatePane takes a store; wrap the hook so each render gets a fresh one backed by localStorage.
function Harness({ predicateNames }: { predicateNames?: ReadonlyMap<string, string> } = {}) {
  const store = usePredicateStore()
  return <PredicatePane store={store} predicateNames={predicateNames} />
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('PredicatePane', () => {
  it('starts with no custom predicates and lists presets by name only', () => {
    render(<Harness />)
    expect(screen.getByText('Your predicates')).toBeTruthy()
    expect(screen.getByText('Presets')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Visited' })).toBeTruthy() // a preset name
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull() // no custom predicates yet
    // decluttered: no Copy, no inline DSL preview until expanded
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByText('visited > 0')).toBeNull()
  })

  it('expands a bundled predicate to reveal its DSL', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Visited' }))
    expect(screen.getByText('visited > 0')).toBeTruthy()
  })

  it('+ New adds an editable predicate compiled live', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    const dsl = screen.getByRole('textbox', { name: 'predicate DSL' }) as HTMLTextAreaElement
    expect(dsl.value).toBe('visited > 0')
    expect(screen.getByText(/✓/)).toBeTruthy() // compiles
  })

  it('shows a compile error for invalid DSL and does not crash', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'predicate DSL' }), { target: { value: 'visited >' } })
    expect(screen.getByRole('alert').textContent).toMatch(/number, attribute/i)
  })

  it('auto-names a simple predicate from its DSL', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect((screen.getByRole('textbox', { name: 'predicate name' }) as HTMLInputElement).value).toBe('visited > 0')
    fireEvent.change(screen.getByRole('textbox', { name: 'predicate DSL' }), { target: { value: 'edge-count==4' } })
    expect((screen.getByRole('textbox', { name: 'predicate name' }) as HTMLInputElement).value).toBe('edge-count == 4')
  })

  it('composes a named-predicate reference and resolves it against predicateNames', () => {
    render(<Harness predicateNames={new Map([['hasA', '[A] > 0']])} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'predicate DSL' }), { target: { value: 'hasA and visited > 0' } })
    expect(screen.getByText(/✓/)).toBeTruthy()
  })

  it('flags a reference to an unknown predicate name (not just a syntax error)', () => {
    render(<Harness predicateNames={new Map()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'predicate DSL' }), { target: { value: 'hasA and visited > 0' } })
    expect(screen.getByRole('alert').textContent).toMatch(/unknown predicate "hasA"/)
  })

  it('deletes a custom predicate via the trash button', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect(screen.queryByRole('textbox', { name: 'predicate DSL' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.queryByRole('textbox', { name: 'predicate DSL' })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })
})
