import { render, fireEvent, screen, cleanup, within } from '@testing-library/react'
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
    onSelectTiles,
    onDeselect,
  }: {
    tiling: { nodes: ReadonlyArray<{ id: string }> }
    onSelect?: (id: string) => void
    onSelectTiles?: (ids: string[]) => void
    onDeselect?: () => void
  }) => (
    <div data-testid="mock-canvas">
      {tiling.nodes.map((n) => (
        <button key={n.id} type="button" onClick={() => onSelect?.(n.id)}>
          {n.id}
        </button>
      ))}
      {/* Stand in for a select-mode box drag selecting the first three tiles. */}
      <button type="button" data-testid="mock-box" onClick={() => onSelectTiles?.(tiling.nodes.slice(0, 3).map((n) => n.id))}>
        box-select
      </button>
      {/* Stand in for a non-selecting gesture (paint / empty tap; pan & zoom now keep the selection). */}
      <button type="button" data-testid="mock-deselect" onClick={() => onDeselect?.()}>
        deselect
      </button>
    </div>
  ),
}))

// No global test setup file, so unmount between tests to keep `screen` queries unambiguous.
afterEach(cleanup)

describe('Workspace', () => {
  it('shows the canvas, the run controls, the inspect pane, and the collapsed authoring panes', () => {
    render(<Workspace />)
    expect(screen.getByTestId('mock-canvas')).toBeTruthy()
    // Play (toggles to Pause) · Step · Stop replace the old "Canvas" title; Play starts disabled (no
    // walkers yet), and there's no separate Pause button until a run is actually playing.
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /^step/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^stop/i })).toBeTruthy()
    expect(screen.getByText(/click a tile to inspect/i)).toBeTruthy()
    // The left docks (Traversers, Coloring) start collapsed — their titles live on the rail.
    expect(screen.getByRole('button', { name: /expand traversers/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /expand coloring/i })).toBeTruthy()
  })

  it('offers the tiling picker, the drag control, the display control, and the grid-size control', () => {
    render(<Workspace />)
    expect(screen.getByRole('button', { name: /square/i })).toBeTruthy()
    // Drag defaults to off (a drag doesn't paint by accident).
    expect(screen.getByRole('button', { name: /drag mode/i }).textContent).toMatch(/off/i)
    expect(screen.getByRole('radiogroup', { name: /tile display/i })).toBeTruthy()
    expect(screen.getByRole('slider', { name: /grid size/i })).toBeTruthy()
  })

  it('the drag popup picks a paint target (switches to paint mode), or box / paint select / off', () => {
    render(<Workspace />)
    const chip = screen.getByRole('button', { name: /drag mode/i })
    expect(chip.textContent).toMatch(/off/i)
    // Open the popup — it offers the modes and the paint targets.
    fireEvent.click(chip)
    expect(screen.getByRole('menuitem', { name: /box select/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /paint select/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /^visited$/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /^B$/ }))
    expect(chip.textContent).toMatch(/paint:\s*B/i) // now paint mode, target B
    // Reopen → box select.
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('menuitem', { name: /box select/i }))
    expect(chip.textContent).toMatch(/box select/i)
    // Reopen → paint select.
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('menuitem', { name: /paint select/i }))
    expect(chip.textContent).toMatch(/paint select/i)
  })

  it('the display segmented control selects edges / none / stats', () => {
    render(<Workspace />)
    const group = within(screen.getByRole('radiogroup', { name: /tile display/i }))
    const radio = (name: RegExp) => group.getByRole('radio', { name }) as HTMLButtonElement
    expect(radio(/edges/i).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radio(/none/i))
    expect(radio(/none/i).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radio(/stats/i))
    expect(radio(/stats/i).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radio(/edges/i))
    expect(radio(/edges/i).getAttribute('aria-checked')).toBe('true')
  })

  it('the speed slider defaults to slow and arrow keys move between the four speeds (turtle → rabbit)', () => {
    render(<Workspace />)
    const speed = screen.getByRole('slider', { name: /traverser speed/i })
    expect(speed.getAttribute('aria-valuemin')).toBe('0')
    expect(speed.getAttribute('aria-valuemax')).toBe('3')
    expect(speed.getAttribute('aria-valuenow')).toBe('1') // default = 2nd notch
    expect(speed.getAttribute('aria-valuetext')).toBe('slow')
    fireEvent.keyDown(speed, { key: 'ArrowRight' })
    expect(speed.getAttribute('aria-valuetext')).toBe('fast')
    fireEvent.keyDown(speed, { key: 'ArrowRight' })
    expect(speed.getAttribute('aria-valuenow')).toBe('3') // rabbit — max
    expect(speed.getAttribute('aria-valuetext')).toBe('max')
    fireEvent.keyDown(speed, { key: 'ArrowRight' }) // clamps at the top
    expect(speed.getAttribute('aria-valuenow')).toBe('3')
    fireEvent.keyDown(speed, { key: 'Home' })
    expect(speed.getAttribute('aria-valuetext')).toBe('very slow') // turtle
  })

  it('the Step button initializes then advances a run (grid locks), leaves Play enabled, and Stop frees it', () => {
    render(<Workspace />)
    const grid = () => screen.getByRole('slider', { name: /grid size/i }) as HTMLInputElement
    const play = () => screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement
    const stepBtn = () => screen.getByRole('button', { name: /^step/i }) as HTMLButtonElement
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    fireEvent.click(screen.getByRole('button', { name: '0:Walker' }))
    fireEvent.click(stepBtn()) // first Step initializes the run (places the seeds), no continuous play
    expect(grid().disabled).toBe(true) // runLive !== null -> grid locked
    expect(play().disabled).toBe(false) // Step is no longer a speed mode -> Play stays enabled
    expect(play().getAttribute('aria-label')).toMatch(/^play/i) // still stopped -> shows Play, not Pause
    fireEvent.click(stepBtn()) // a further Step advances one tick (no error)
    fireEvent.click(screen.getByRole('button', { name: /^stop/i }))
    expect(grid().disabled).toBe(false)
  })

  it('the Play button toggles to Pause while running and back to Play', () => {
    render(<Workspace />)
    const btn = () => screen.getByRole('button', { name: /^(play|pause)/i }) as HTMLButtonElement
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    fireEvent.click(screen.getByRole('button', { name: '0:Walker' }))
    expect(btn().getAttribute('aria-label')).toMatch(/^play/i)
    fireEvent.click(btn()) // play -> running
    expect(btn().getAttribute('aria-label')).toMatch(/^pause/i)
    fireEvent.click(btn()) // pause -> back to Play
    expect(btn().getAttribute('aria-label')).toMatch(/^play/i)
  })

  it('locks grid resize during an active run (Play + Pause), frees it on Stop', () => {
    render(<Workspace />)
    const slider = () => screen.getByRole('slider', { name: /grid size/i }) as HTMLInputElement
    expect(slider().disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    fireEvent.click(screen.getByRole('button', { name: '0:Walker' }))
    fireEvent.click(screen.getByRole('button', { name: /^play/i }))
    expect(slider().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^pause/i }))
    expect(slider().disabled).toBe(true) // a paused run is still active — keep it locked
    fireEvent.click(screen.getByRole('button', { name: /^stop/i }))
    expect(slider().disabled).toBe(false)
  })

  it('has a mobile ⋯ overflow toggle for Fit / Reset / grid', () => {
    render(<Workspace />)
    const more = screen.getByRole('button', { name: /more controls/i })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
  })

  it('clears the selection on a non-selecting interaction (paint / empty tap)', () => {
    render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    expect(screen.getByText('Tile #0')).toBeTruthy()
    fireEvent.click(screen.getByTestId('mock-deselect'))
    expect(screen.getByText(/click a tile to inspect/i)).toBeTruthy() // back to the empty hint
  })

  it('box-select shows a multi-tile bulk view and places traversers on all at once', () => {
    render(<Workspace />)
    fireEvent.click(screen.getByTestId('mock-box')) // select the first three tiles
    expect(screen.getByText(/3 tiles selected/i)).toBeTruthy()
    // No per-tile stats (no "Tile #" heading), Play disabled until walkers exist.
    expect(screen.queryByText(/^Tile #/)).toBeNull()
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(true)
    // "Place on all:" label + a direct-place button (the built-in) — one click places on all three.
    expect(screen.getByText('Place on all:')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '0:Walker' }))
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(false)
    // Bulk rotate + remove are offered.
    expect(screen.getByRole('button', { name: /rotate all headings right/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /remove all/i }))
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(true)
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

  it('offers a "Place:" label with a direct-place button per definition, and shows the placed name', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    // Small library: a "Place:" label + one button per definition (just the built-in here); clicking a
    // button places that definition directly — no separate Place step.
    expect(screen.getByText('Place:')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '0:Walker' }))
    expect(container.querySelector('.trav-name')?.textContent).toBe('0:Walker')
  })

  it('places a traverser from Inspect: enables Play and shows aim controls, recording no visit yet', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    // No walker yet -> a direct-place button is offered and Play is disabled.
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '0:Walker' }))
    // Placement records no visit (the walk records visits); Play is enabled and aim controls replace the place row.
    expect(container.querySelector('.visited-value')?.textContent).toBe('0')
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: /rotate heading right/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '0:Walker' })).toBeNull()
  })

  it('Play marks the start tile; Stop restores the authored placement; only Reset removes it', () => {
    const { container } = render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: 'sq:1,1' }))
    fireEvent.click(screen.getByRole('button', { name: '0:Walker' }))
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

    // Only Reset removes the walker (the place row — the "0:Walker" button — returns).
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('button', { name: '0:Walker' })).toBeTruthy()
    expect((screen.getByRole('button', { name: /^play/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('panels collapse and expand', () => {
    render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: /collapse inspect/i }))
    expect(screen.getByRole('button', { name: /expand inspect/i })).toBeTruthy()
  })

  it('the left docks are an accordion — opening one collapses the other', () => {
    render(<Workspace />)
    // Both start collapsed; open Traversers.
    fireEvent.click(screen.getByRole('button', { name: /expand traversers/i }))
    expect(screen.getByRole('button', { name: /collapse traversers/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /expand coloring/i })).toBeTruthy()
    // Opening Coloring collapses Traversers (only one open per side).
    fireEvent.click(screen.getByRole('button', { name: /expand coloring/i }))
    expect(screen.getByRole('button', { name: /collapse coloring/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /expand traversers/i })).toBeTruthy()
  })

  it('the Custom predicates badge opens the shared predicates dialog', () => {
    render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: /expand coloring/i }))
    fireEvent.click(screen.getByRole('button', { name: /custom predicates/i }))
    expect(screen.getByRole('dialog', { name: /custom predicates/i })).toBeTruthy()
  })

  it('selecting a tile re-opens the Inspect pane when it was collapsed', () => {
    render(<Workspace />)
    fireEvent.click(screen.getByRole('button', { name: /collapse inspect/i }))
    expect(screen.getByRole('button', { name: /expand inspect/i })).toBeTruthy()
    // Clicking a tile auto-opens Inspect (the accordion would otherwise hide it) and shows the tile.
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    expect(screen.getByText('Tile #0')).toBeTruthy()
  })

  // Last in the file: it adds a custom traverser definition, which persists via localStorage for the
  // rest of this file's tests (jsdom shares one `window` per test file) — later tests assume a clean
  // library (just the built-in "Walker"), so nothing else may run after this one.
  it('carries an already-placed walker over when its traverser definition is renamed', () => {
    const { container } = render(<Workspace />)
    // A custom definition (the built-in "Walker" can't be renamed) — place it, but don't rename yet.
    fireEvent.click(screen.getByRole('button', { name: /expand traversers/i }))
    fireEvent.click(screen.getByRole('button', { name: '+ New' })) // opens the editor, default name "walker"
    fireEvent.click(screen.getByRole('button', { name: /done/i })) // back to the list, unedited

    fireEvent.click(screen.getByRole('button', { name: 'sq:0,0' }))
    fireEvent.click(screen.getByRole('button', { name: '1:walker' })) // place the CUSTOM def, not the built-in
    expect(container.querySelector('.trav-name')?.textContent).toBe('1:walker')

    // Rename the definition — the already-placed walker must follow, not go stale (the reported bug).
    fireEvent.click(screen.getByRole('button', { name: /^1:\s*walker$/ }))
    fireEvent.change(screen.getByLabelText('traverser name'), { target: { value: 'renamed' } })
    fireEvent.click(screen.getByRole('button', { name: /done/i }))

    // Inspect reflects the new name against the SAME placed walker — no re-placement needed.
    expect(container.querySelector('.trav-name')?.textContent).toBe('1:renamed')

    // The engine can still resolve + run it: Step seeds (tick 1), then a real tick (tick 2) moves the
    // walker onto an unvisited neighbour. Before the fix the stale `def` makes `defs.get()` miss and the
    // walker is silently dropped, so neither neighbour would ever pick up a visit.
    const stepBtn = () => screen.getByRole('button', { name: /^step/i })
    fireEvent.click(stepBtn())
    fireEvent.click(stepBtn())
    fireEvent.click(screen.getByRole('button', { name: 'sq:1,0' }))
    const a = container.querySelector('.visited-value')?.textContent
    fireEvent.click(screen.getByRole('button', { name: 'sq:0,1' }))
    const b = container.querySelector('.visited-value')?.textContent
    expect([a, b]).toContain('1')
  })
})
