import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ExportMenu } from './ExportMenu'
import { buildTiling } from '../canvas'

afterEach(cleanup)

function renderMenu() {
  const onStartExport = vi.fn()
  const r = render(
    <ExportMenu
      tilingId="square"
      tiling={buildTiling('square', 4)}
      liveGridN={20}
      seeds={[]}
      baseOverlay={new Map()}
      predicates={[]}
      traversers={[]}
      coloringRules={[]}
      initialState=""
      numberingScheme="left-to-right"
      onStartExport={onStartExport}
    />,
  )
  // Open the dialog (click the toolbar trigger chip).
  fireEvent.click(r.container.querySelector('.canvas-trigger') as HTMLElement)
  return { ...r, onStartExport }
}

describe('ExportMenu — aspect-transfer arrows', () => {
  it('renders the two arrows between the grid and resolution groups', () => {
    const { container } = renderMenu()
    const arrows = container.querySelectorAll('.export-arrow')
    expect(arrows.length).toBe(2)

    const pop = container.querySelector('.export-pop')!
    const kids = [...pop.children]
    const idx = (label: string) => kids.findIndex((c) => c.getAttribute('aria-label') === label)
    const gridIdx = idx('grid size (tiles)')
    const transferIdx = idx('transfer aspect ratio')
    const resIdx = idx('resolution (pixels)')
    expect(gridIdx).toBeGreaterThanOrEqual(0)
    // grid → transfer → resolution, in that DOM order
    expect(transferIdx).toBe(gridIdx + 1)
    expect(resIdx).toBe(transferIdx + 1)
  })

  it('↓ arrow reshapes the resolution to the grid aspect (1:8) without touching the grid', () => {
    renderMenu()
    // Unlink the grid so we can set an uneven grid, then set 10 × 80.
    fireEvent.click(screen.getByLabelText(/grid width and height linked/))
    fireEvent.change(screen.getByLabelText(/grid width in tiles/), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/grid height in tiles/), { target: { value: '80' } })

    fireEvent.click(screen.getByLabelText(/reshape the resolution to match/))

    // Resolution now 1:8 with the longer edge preserved (2048); grid unchanged.
    expect((screen.getByLabelText('export width in pixels') as HTMLInputElement).value).toBe('256')
    expect((screen.getByLabelText('export height in pixels') as HTMLInputElement).value).toBe('2048')
    expect((screen.getByLabelText(/grid width in tiles/) as HTMLInputElement).value).toBe('10')
    expect((screen.getByLabelText(/grid height in tiles/) as HTMLInputElement).value).toBe('80')
  })

  it('↑ arrow reshapes the grid to the resolution aspect (16:9) without touching the resolution', () => {
    renderMenu()
    // Set an unlinked 16:9 resolution. (Anchor the regex so it hits the resolution lock, not the grid
    // lock whose label starts with "grid width and height linked".)
    fireEvent.click(screen.getByLabelText(/^width and height linked/))
    fireEvent.change(screen.getByLabelText('export width in pixels'), { target: { value: '1920' } })
    fireEvent.change(screen.getByLabelText('export height in pixels'), { target: { value: '1080' } })

    fireEvent.click(screen.getByLabelText(/reshape the grid to match/))

    // Grid now ~16:9; resolution untouched.
    const gw = Number((screen.getByLabelText(/grid width in tiles/) as HTMLInputElement).value)
    const gh = Number((screen.getByLabelText(/grid height in tiles/) as HTMLInputElement).value)
    expect(gw / gh).toBeCloseTo(1920 / 1080, 1)
    expect((screen.getByLabelText('export width in pixels') as HTMLInputElement).value).toBe('1920')
    expect((screen.getByLabelText('export height in pixels') as HTMLInputElement).value).toBe('1080')
  })

  it('editing the resolution moves pixels-per-tile, never the grid', () => {
    const { container } = renderMenu()
    const gridWBefore = (screen.getByLabelText(/grid width in tiles/) as HTMLInputElement).value
    const pxInput = container.querySelector('.export-row input[type="number"]') as HTMLInputElement
    const pxBefore = pxInput.value

    fireEvent.change(screen.getByLabelText('export width in pixels'), { target: { value: '1000' } })

    // grid unchanged...
    expect((screen.getByLabelText(/grid width in tiles/) as HTMLInputElement).value).toBe(gridWBefore)
    // ...px re-derived.
    expect(pxInput.value).not.toBe(pxBefore)
  })
})
