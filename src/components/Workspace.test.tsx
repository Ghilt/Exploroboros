import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { Workspace } from './Workspace'

// The Konva renderer needs a real canvas (absent in jsdom). Mock it with a lightweight DOM
// surface that exposes the selection callback, so Workspace's selection -> inspect wiring is
// testable here; the canvas drawing itself is verified on a real device. The pure transform /
// hit-test / clipboard logic is covered directly in src/canvas/*.test.ts.
vi.mock('./TilingCanvas', () => ({
  TilingCanvas: ({
    tiling,
    onSelect,
  }: {
    tiling: { nodes: ReadonlyArray<{ id: string }> }
    onSelect?: (id: string) => void
  }) => (
    <div data-testid="mock-canvas">
      {tiling.nodes.map((n) => (
        <button key={n.id} type="button" onClick={() => onSelect?.(n.id)}>
          {n.id}
        </button>
      ))}
    </div>
  ),
}))

// No global test setup file, so unmount between tests to keep `screen` queries unambiguous.
afterEach(cleanup)

describe('Workspace', () => {
  it('shows the canvas, the inspect pane, and the collapsed authoring panes', () => {
    render(<Workspace />)
    expect(screen.getByText('Canvas')).toBeTruthy()
    expect(screen.getByText(/click a tile to inspect/i)).toBeTruthy()
    // Traversers and Coloring start collapsed — their titles live on the rail.
    expect(screen.getByRole('button', { name: /expand traversers/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /expand coloring/i })).toBeTruthy()
  })

  it('offers the tiling picker, the paint chip, the display chip, and the grid-size control', () => {
    render(<Workspace />)
    expect(screen.getByRole('button', { name: /square/i })).toBeTruthy()
    expect(screen.getByText(/paint: visited/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /display:/i })).toBeTruthy()
    expect(screen.getByRole('slider', { name: /grid size/i })).toBeTruthy()
  })

  it('the display chip cycles edges -> none -> stats -> edges', () => {
    render(<Workspace />)
    const chip = screen.getByRole('button', { name: /display:/i })
    expect(chip.textContent).toMatch(/edges/i)
    fireEvent.click(chip)
    expect(chip.textContent).toMatch(/none/i)
    fireEvent.click(chip)
    expect(chip.textContent).toMatch(/stats/i)
    fireEvent.click(chip)
    expect(chip.textContent).toMatch(/edges/i)
  })

  it('selecting a tile inspects it (number, row, column)', () => {
    render(<Workspace />)
    expect(screen.getByText(/click a tile to inspect/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    expect(screen.getByText('Tile #0')).toBeTruthy()
    expect(screen.getByText('row')).toBeTruthy()
    expect(screen.getByText('column')).toBeTruthy()
  })

  it('the + control raises the selected tile visited count', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    fireEvent.click(screen.getByRole('button', { name: /increase visited/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('1')
  })

  it('copies a tile’s attributes and pastes them onto another tile', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    fireEvent.click(screen.getByRole('button', { name: /increase visited/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: /copy tile attributes/i }))
    // switch to a different tile (visited 0), then paste
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,1' }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: /paste tile attributes/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('1')
  })

  it('panels collapse and expand', () => {
    render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: /collapse inspect/i }))
    expect(screen.getByRole('button', { name: /expand inspect/i })).toBeTruthy()
  })
})
