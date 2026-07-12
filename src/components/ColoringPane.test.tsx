import { useEffect } from 'react'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ColoringPane } from './ColoringPane'
import { useColoringStore } from '../state/coloringStore'
import type { ColoringRule } from '../colorizer'

function Harness({
  customPredicates = [{ id: 'p1', name: 'My predicate', text: 'visited > 0' }],
  predicateNames,
  initialRules,
}: {
  customPredicates?: { id: string; name: string; text: string }[]
  predicateNames?: ReadonlyMap<string, string>
  initialRules?: ColoringRule[]
} = {}) {
  const store = useColoringStore()
  useEffect(() => {
    if (initialRules) store.setAll(initialRules)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <ColoringPane store={store} customPredicates={customPredicates} predicateNames={predicateNames} />
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

  it('duplicates a rule, inserting a second copy', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    expect(screen.getAllByRole('combobox', { name: 'rule predicate' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'duplicate rule' }))
    expect(screen.getAllByRole('combobox', { name: 'rule predicate' })).toHaveLength(2)
  })

  it('the eye toggle switches a rule off (dims the row) and back on', () => {
    const { container } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    expect(container.querySelector('.rule-row.is-disabled')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /switch this rule off/i }))
    expect(container.querySelector('.rule-row.is-disabled')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /switch this rule on/i }))
    expect(container.querySelector('.rule-row.is-disabled')).toBeNull()
  })

  it('the dice randomizes the flat colour', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0) // -> #000000
    try {
      render(<Harness />)
      fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
      expect((screen.getByLabelText('colour') as HTMLInputElement).value).not.toBe('#000000') // the default fill
      fireEvent.click(screen.getByRole('button', { name: 'randomize colour' }))
      expect((screen.getByLabelText('colour') as HTMLInputElement).value).toBe('#000000')
    } finally {
      spy.mockRestore()
    }
  })

  it('flags an inline predicate that fails to parse, with a badge and an error message', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'rule predicate' }), { target: { value: '__inline__' } })
    expect(screen.queryByRole('alert')).toBeNull() // no error yet — the default inline text is valid
    fireEvent.change(screen.getByRole('textbox', { name: 'inline predicate' }), { target: { value: 'visited >' } })
    expect(screen.getByRole('alert').textContent).toBeTruthy()
    expect(screen.getByText('error')).toBeTruthy() // the badge
  })

  it('flags a rule whose referenced predicate no longer exists', () => {
    const rule: ColoringRule = {
      id: 'r1',
      predicate: { kind: 'ref', id: 'ghost' },
      color: { kind: 'flat', hex: '#ffffff' },
      opacity: 1,
    }
    render(<Harness initialRules={[rule]} />)
    expect(screen.getByTitle(/no longer exists/i)).toBeTruthy()
    expect((screen.getByRole('combobox', { name: 'rule predicate' }) as HTMLSelectElement).value).toBe('ghost')
  })

  it('flags a rule whose referenced custom predicate does not compile', () => {
    const rule: ColoringRule = {
      id: 'r1',
      predicate: { kind: 'ref', id: 'p1' },
      color: { kind: 'flat', hex: '#ffffff' },
      opacity: 1,
    }
    render(<Harness customPredicates={[{ id: 'p1', name: 'Broken', text: 'visited >' }]} initialRules={[rule]} />)
    expect(screen.getByTitle(/doesn't compile/i)).toBeTruthy()
  })

  it('composes two named predicates with "and" in the inline field (underscore-joined names)', () => {
    const names = new Map([
      ['Has_A', '[A] > 0'],
      ['Has_C', '[C] > 0'],
    ])
    render(<Harness predicateNames={names} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'rule predicate' }), { target: { value: '__inline__' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'inline predicate' }), { target: { value: 'Has_A and Has_C' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('error')).toBeNull()
  })

  it('flags an inline predicate that references an unknown name', () => {
    render(<Harness predicateNames={new Map()} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'rule predicate' }), { target: { value: '__inline__' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'inline predicate' }), { target: { value: 'Has_A and Has_C' } })
    expect(screen.getByRole('alert').textContent).toMatch(/unknown predicate "Has_A"/)
  })

  it('Ctrl+Space in the inline predicate suggests attributes and predicate names (no statement keywords)', () => {
    render(<Harness predicateNames={new Map([['Has_A', '[A] > 0']])} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'rule predicate' }), { target: { value: '__inline__' } })
    const input = screen.getByRole('textbox', { name: 'inline predicate' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    input.setSelectionRange(0, 0)
    fireEvent.keyDown(input, { key: ' ', code: 'Space', ctrlKey: true })
    const values = screen.getAllByRole('option').map((o) => o.querySelector('.dsl-ac-val')?.textContent)
    expect(values).toContain('visited')
    expect(values).toContain('Has_A')
    expect(values).not.toContain('move') // a predicate field never offers statement keywords
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
