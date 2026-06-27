import { useState } from 'react'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { PredicateVisualEditor } from './PredicateVisualEditor'

afterEach(cleanup)

// Stateful wrapper so edits flow back as text, like the real PredicateEditor.
function Harness({ initial }: { initial: string }) {
  const [text, setText] = useState(initial)
  return (
    <>
      <div data-testid="dsl">{text}</div>
      <PredicateVisualEditor text={text} onChange={setText} />
    </>
  )
}
const dsl = () => screen.getByTestId('dsl').textContent

describe('PredicateVisualEditor', () => {
  it('renders the predicate as attribute / operator / number chips', () => {
    render(<Harness initial="visited > 0" />)
    expect(screen.getByRole('button', { name: 'visited' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '>' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'number' })).toBeTruthy()
  })

  it('opens the operator dropdown and sets subtract when the "-" key is pressed', () => {
    render(<Harness initial="visited + 1 == 2" />)
    fireEvent.click(screen.getByRole('button', { name: '+' })) // arithmetic operator chip
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: '-' })
    expect(dsl()).toBe('visited - 1 == 2')
  })

  it('lets you pick a comparison operator from the dropdown by click', () => {
    render(<Harness initial="visited > 0" />)
    fireEvent.click(screen.getByRole('button', { name: '>' }))
    fireEvent.click(screen.getByRole('option', { name: /at least/i })) // >=
    expect(dsl()).toBe('visited >= 0')
  })

  it('swaps an attribute via its dropdown', () => {
    render(<Harness initial="visited > 0" />)
    fireEvent.click(screen.getByRole('button', { name: 'visited' }))
    fireEvent.click(screen.getByRole('option', { name: 'edge count' }))
    expect(dsl()).toBe('edge-count > 0')
  })

  it('edits a number inline', () => {
    render(<Harness initial="visited > 0" />)
    fireEvent.click(screen.getByRole('button', { name: 'number' }))
    const input = screen.getByRole('spinbutton', { name: 'number' })
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(dsl()).toBe('visited > 5')
  })

  it('edits a tile-type shape name inline', () => {
    render(<Harness initial="tile-type == square" />)
    fireEvent.click(screen.getByRole('button', { name: 'shape name' }))
    const input = screen.getByRole('textbox', { name: 'shape name' })
    fireEvent.change(input, { target: { value: 'triangle' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(dsl()).toBe('tile-type == triangle')
  })

  it('falls back to a message for a predicate that does not parse', () => {
    render(<Harness initial="visited >" />)
    expect(screen.getByText(/syntax error/i)).toBeTruthy()
  })
})
