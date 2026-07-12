import { render, fireEvent, screen, cleanup, act } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { Workspace } from './Workspace'

// Each test renders the full Workspace and drives several interactions, so it's on the heavy side; give it
// headroom above the 5s default so it can't flake on a timeout when the suite runs under parallel load.
vi.setConfig({ testTimeout: 20000 })

// Path-preview wiring: selecting text in the Traversers editor lights up that traverser's paths on the
// canvas — but ONLY when exactly one selected tile carries a walker of the same definition. The pure logic
// (scanPaths / resolveWalk / buildPathPreview / colours) is unit-tested in src/traverse + src/canvas; this
// file verifies the Workspace<->TraversersPane<->TilingCanvas plumbing + the gate. A dedicated file so its
// custom-definition localStorage state can't leak into Workspace.test.tsx (jsdom is per-file).
//
// The mock exposes `pathPreview` as JSON so tests can read what the canvas would draw.
type PreviewEntry = { tiles: ReadonlyArray<string>; color: string }
vi.mock('./TilingCanvas', () => ({
  TilingCanvas: ({
    tiling,
    onSelect,
    pathPreview,
  }: {
    tiling: { nodes: ReadonlyArray<{ id: string }> }
    onSelect?: (id: string) => void
    pathPreview?: ReadonlyArray<PreviewEntry>
  }) => (
    <div data-testid="mock-canvas">
      {tiling.nodes.map((n) => (
        <button key={n.id} type="button" onClick={() => onSelect?.(n.id)}>
          {n.id}
        </button>
      ))}
      <div data-testid="path-preview">{JSON.stringify(pathPreview ?? null)}</div>
    </div>
  ),
}))

// A clean store per test (jsdom shares localStorage within a file) + fake timers for the ~80ms debounce.
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const readPreview = (): PreviewEntry[] | null => JSON.parse(screen.getByTestId('path-preview').textContent || 'null')

// Select a range in the editor's textarea and flush the debounce.
const selectRange = (start: number, end: number) => {
  const ta = screen.getByLabelText('traverser DSL') as HTMLTextAreaElement
  ta.selectionStart = start
  ta.selectionEnd = end
  act(() => {
    fireEvent.select(ta)
    vi.advanceTimersByTime(120)
  })
}
const selectWhole = () => {
  const ta = screen.getByLabelText('traverser DSL') as HTMLTextAreaElement
  selectRange(0, ta.value.length)
}

// Author a custom definition (the built-in Walker can't be edited), returning to the list. The default
// program `move nearest-unvisited` already contains a path, which is all the preview needs.
const authorDef = () => {
  fireEvent.click(screen.getByRole('button', { name: /expand traversers/i }))
  fireEvent.click(screen.getByRole('button', { name: '+ New' }))
  fireEvent.click(screen.getByRole('button', { name: /done/i }))
}

describe('Workspace path preview', () => {
  it('lights up the selected path when the tile carries that definition', () => {
    render(<Workspace />)
    authorDef()
    // Place the custom def on a middle tile. The Inspect place button is "1:walker" (exact); the list row
    // is "1: walker" (a space after the colon), so the exact string matches only the place button.
    fireEvent.click(screen.getByRole('button', { name: 'sq:2,2' }))
    fireEvent.click(screen.getByRole('button', { name: '1:walker' })) // the Inspect place button
    fireEvent.click(screen.getByRole('button', { name: '1: walker' })) // the list row -> editor

    expect(readPreview()).toBeNull() // nothing until text is selected
    selectWhole()
    const pv = readPreview()
    expect(pv).not.toBeNull()
    expect(pv!.length).toBeGreaterThan(0)
    expect(pv![0].tiles.length).toBeGreaterThan(0)
    expect(pv![0].color).toMatch(/^#/)
    // Whole-program selection also drops a swatch beside the (single) source line in the editor gutter.
    expect(document.querySelectorAll('.trav-swatch').length).toBe(1)
  })

  it('shows nothing when the selected tile has no walker (the gate)', () => {
    render(<Workspace />)
    authorDef()
    // Select a tile but place NO walker, then open the editor and select text.
    fireEvent.click(screen.getByRole('button', { name: 'sq:2,2' }))
    fireEvent.click(screen.getByRole('button', { name: '1: walker' }))
    selectWhole()
    expect(readPreview()).toBeNull()
  })

  it('shows nothing for a collapsed caret (no real selection)', () => {
    render(<Workspace />)
    authorDef()
    fireEvent.click(screen.getByRole('button', { name: 'sq:2,2' }))
    fireEvent.click(screen.getByRole('button', { name: '1:walker' }))
    fireEvent.click(screen.getByRole('button', { name: '1: walker' }))
    selectRange(3, 3) // caret only, mid-text (not whole-program)
    expect(readPreview()).toBeNull()
  })
})
