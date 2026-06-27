import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { Workspace } from './Workspace'
import { squareTiling } from '../tiling'

// No global test setup file, so unmount between tests to keep `screen` queries unambiguous.
afterEach(cleanup)

describe('Workspace', () => {
  it('shows the canvas plus the inspect / traversers / coloring panes', () => {
    render(<Workspace tiling={squareTiling(4, 4)} />)
    expect(screen.getByText('Canvas')).toBeTruthy()
    expect(screen.getByText('Inspect')).toBeTruthy()
    // Traversers and Coloring start collapsed — their titles live on the rail.
    expect(screen.getByRole('button', { name: /expand traversers/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /expand coloring/i })).toBeTruthy()
  })

  it('tile numbers are off by default and toggle on', () => {
    const { container } = render(<Workspace tiling={squareTiling(4, 4)} />)
    expect(container.querySelectorAll('.tile-num').length).toBe(0)
    fireEvent.click(screen.getByRole('checkbox', { name: /numbers/i }))
    expect(container.querySelectorAll('.tile-num').length).toBe(16)
  })

  it('clicking a tile inspects it (number, row, column)', () => {
    const { container } = render(<Workspace tiling={squareTiling(4, 4)} />)
    const poly = container.querySelector('polygon')
    if (poly) fireEvent.click(poly)
    expect(screen.getByText('Tile #0')).toBeTruthy()
    expect(screen.getByText('row')).toBeTruthy()
    expect(screen.getByText('column')).toBeTruthy()
  })

  it('the + control raises visited and shows a vN badge on the grid', () => {
    const { container } = render(<Workspace tiling={squareTiling(4, 4)} />)
    const poly = container.querySelector('polygon')
    if (poly) fireEvent.click(poly)
    fireEvent.click(screen.getByRole('button', { name: /increase visited/i }))
    expect(container.querySelector('.visited-value')?.textContent).toBe('1')
    expect([...container.querySelectorAll('.tile-visited')].map((n) => n.textContent)).toContain('v1')
  })

  it('panels collapse and expand', () => {
    render(<Workspace tiling={squareTiling(4, 4)} />)
    fireEvent.click(screen.getByRole('button', { name: /collapse inspect/i }))
    expect(screen.getByRole('button', { name: /expand inspect/i })).toBeTruthy()
  })
})
