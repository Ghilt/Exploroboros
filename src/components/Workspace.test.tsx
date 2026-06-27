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
  it('shows the canvas, the run controls, the inspect pane, and the collapsed authoring panes', () => {
    render(<Workspace />)
    expect(screen.getByTestId('mock-canvas')).toBeTruthy()
    // Play/Pause/Stop replace the old "Canvas" title; Play starts disabled (no walkers yet).
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /^pause/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^stop/i })).toBeTruthy()
    expect(screen.getByText(/click a tile to inspect/i)).toBeTruthy()
    // Traversers, Predicates and Coloring start collapsed — their titles live on the rail.
    expect(screen.getByRole('button', { name: /expand traversers/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /expand predicates/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /expand coloring/i })).toBeTruthy()
  })

  it('offers the tiling picker, the paint picker, the display chip, and the grid-size control', () => {
    render(<Workspace />)
    expect(screen.getByRole('button', { name: /square/i })).toBeTruthy()
    expect((screen.getByRole('combobox', { name: /paint target/i }) as HTMLSelectElement).value).toBe('visited')
    expect(screen.getByRole('button', { name: /display:/i })).toBeTruthy()
    expect(screen.getByRole('slider', { name: /grid size/i })).toBeTruthy()
  })

  it('lets you choose what a drag paints (visited / A / B / C)', () => {
    render(<Workspace />)
    const paint = screen.getByRole('combobox', { name: /paint target/i }) as HTMLSelectElement
    expect(paint.value).toBe('visited')
    fireEvent.change(paint, { target: { value: 'b' } })
    expect(paint.value).toBe('b')
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

  it('the speed chip cycles slow -> fast -> max (default fast)', () => {
    render(<Workspace />)
    const chip = screen.getByRole('button', { name: /speed:/i })
    expect(chip.textContent).toMatch(/fast/i)
    fireEvent.click(chip)
    expect(chip.textContent).toMatch(/max/i)
    fireEvent.click(chip)
    expect(chip.textContent).toMatch(/slow/i)
    fireEvent.click(chip)
    expect(chip.textContent).toMatch(/fast/i)
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

  it('records a manual visit and surfaces it in the steps readout', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    const steps = () => container.querySelector('.steps-readout')?.textContent ?? ''
    expect(steps()).not.toMatch(/\d/) // blank ("—") before any visit
    fireEvent.click(screen.getByRole('button', { name: /increase visited/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('1')
    expect(steps()).toMatch(/1/) // the step (−1) is now listed
  })

  it('the registry steppers raise and clamp a tile’s A counter, and Reset clears it', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    expect(container.querySelector('.reg-a')?.textContent).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: /increase A/i }))
    fireEvent.click(screen.getByRole('button', { name: /increase A/i }))
    expect(container.querySelector('.reg-a')?.textContent).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: /decrease A/i }))
    expect(container.querySelector('.reg-a')?.textContent).toBe('1')
    // a counter alone enables Reset, which clears everything
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(container.querySelector('.reg-a')?.textContent).toBe('0')
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

  it('Reset is disabled until something is painted, then clears the visited counts', () => {
    const { container } = render(<Workspace />)
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    fireEvent.click(screen.getByRole('button', { name: /increase visited/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('1')
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('0')
  })

  it('switching tiling type clears the visited overlay and the selection', () => {
    const { container } = render(<Workspace />)
    // Paint a tile on the default square tiling.
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    fireEvent.click(screen.getByRole('button', { name: /increase visited/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('1')
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(false)

    // Switch to a different tiling via the picker.
    fireEvent.click(screen.getByRole('button', { name: /^square/i })) // open the gallery
    fireEvent.click(screen.getByRole('button', { name: /^triangular/i })) // choose Triangular

    // The visited overlay is gone (Reset disabled again) and the inspector is cleared.
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/click a tile to inspect/i)).toBeTruthy()
  })

  it('places a traverser from Inspect: enables Play and shows aim controls, recording no visit yet', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    // No walker yet -> the Place button is offered and Play is disabled.
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /place traverser/i }))
    // Placement records no visit (the walk records visits); Play is enabled and aim controls replace Place.
    expect(container.querySelector('.visited-value')?.textContent).toBe('0')
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: /rotate heading right/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /place traverser/i })).toBeNull()
  })

  it('Play marks the start tile; Stop restores the authored placement; only Reset removes it', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:1,1' }))
    fireEvent.click(screen.getByRole('button', { name: /place traverser/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('0')

    // Play seeds the start tile (step 0) and hands the walkers to the run (Inspect shows the note).
    fireEvent.click(screen.getByRole('button', { name: /^play/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('1')
    expect(screen.getByText(/stop the run to edit/i)).toBeTruthy()

    // Stop discards the run trail and restores the authored state: tile back to 0, walker (aim
    // controls) returns — the manually-crafted placement is intact.
    fireEvent.click(screen.getByRole('button', { name: /^stop/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('0')
    expect(screen.getByRole('button', { name: /rotate heading right/i })).toBeTruthy()
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(false)

    // Only Reset removes the walker.
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('button', { name: /place traverser/i })).toBeTruthy()
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('panels collapse and expand', () => {
    render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: /collapse inspect/i }))
    expect(screen.getByRole('button', { name: /expand inspect/i })).toBeTruthy()
  })
})
