import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { TraversersPane } from './TraversersPane'
import { useTraverserStore } from '../state/traverserStore'

// TraversersPane takes a store; wrap the hook so each render gets a fresh one backed by localStorage.
function Harness({ predicateNames }: { predicateNames?: ReadonlyMap<string, string> } = {}) {
  const store = useTraverserStore()
  return <TraversersPane store={store} predicateNames={predicateNames ?? new Map()} />
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('TraversersPane editor', () => {
  it('+ New opens the maximized editor with a Syntax section, a help button, and the Ctrl+Space hint', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect(screen.getByRole('textbox', { name: 'traverser DSL' })).toBeTruthy()
    expect(screen.getByText('Syntax')).toBeTruthy()
    // the "?" that leads to the guide
    expect(screen.getByRole('button', { name: /About Traverser rules/i })).toBeTruthy()
    // the discoverability hint for Ctrl+Space
    expect(screen.getByText(/suggest attributes/i).textContent).toMatch(/Ctrl/)
  })

  it('Show reveals the grammar reference, Hide collapses it', () => {
    const { container } = render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    expect(container.querySelector('.trav-syntax-code')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(container.querySelector('.trav-syntax-code')?.textContent).toMatch(/move straight/)
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(container.querySelector('.trav-syntax-code')).toBeNull()
  })
})

describe('TraversersPane autocomplete (Ctrl+Space)', () => {
  const openEditor = (value: string, caret: number, predicateNames?: ReadonlyMap<string, string>) => {
    render(<Harness predicateNames={predicateNames} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    const ta = screen.getByRole('textbox', { name: 'traverser DSL' }) as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value } })
    ta.setSelectionRange(caret, caret)
    fireEvent.keyDown(ta, { key: ' ', code: 'Space', ctrlKey: true })
    return ta
  }
  const optionValues = () => screen.getAllByRole('option').map((o) => o.querySelector('.dsl-ac-val')?.textContent)

  it('on a blank line, suggests the line-starting keywords (not attributes)', () => {
    openEditor('', 0)
    const values = optionValues()
    expect(values).toContain('if')
    expect(values).toContain('move')
    expect(values).toContain('put')
    expect(values).toContain('reset directives')
    expect(values).toContain('movement') // one of the ones commonly missed
    expect(values).not.toContain('visited') // attributes aren't valid at a line start
  })

  it('in predicate position (after "if"), suggests tile + walker attributes and predicate names', () => {
    openEditor('if ', 3, new Map([['isCrowded', 'visited-neighbors > 2']]))
    const values = optionValues()
    expect(values).toContain('visited')
    expect(values).toContain('heading') // walker attribute (traverser context)
    expect(values).toContain('isCrowded') // referenceable predicate name
    expect(values).not.toContain('move') // keywords aren't offered mid-predicate
  })

  it('narrows to the typed word and inserts the chosen token at the cursor', () => {
    // Line-start word "mo" filters the keywords; picking one replaces the word.
    const ta = openEditor('mo', 2)
    const values = optionValues()
    expect(values).toContain('move')
    expect(values).toContain('morph')
    expect(values).toContain('movement')
    expect(values).not.toContain('if')
    const move = screen.getAllByRole('option').find((o) => o.querySelector('.dsl-ac-val')?.textContent === 'move')
    fireEvent.click(move!)
    expect((screen.getByRole('textbox', { name: 'traverser DSL' }) as HTMLTextAreaElement).value).toBe('move')
    expect(ta).toBeTruthy()
  })

  it('filters attributes by the partial word in predicate position', () => {
    openEditor('if visi', 7)
    const values = optionValues()
    expect(values).toContain('visited')
    expect(values).not.toContain('orientation') // filtered out by the "visi" prefix
  })

  it('Escape dismisses the suggestion menu', () => {
    const ta = openEditor('', 0)
    expect(screen.queryByRole('listbox', { name: 'DSL suggestions' })).not.toBeNull()
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: 'DSL suggestions' })).toBeNull()
  })
})
