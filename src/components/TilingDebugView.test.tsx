import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TilingDebugView } from './TilingDebugView'
import { squareTiling } from '../tiling'

describe('TilingDebugView', () => {
  it('renders an svg with a viewBox and meet aspect ratio', () => {
    const { container } = render(<TilingDebugView tiling={squareTiling(20, 20)} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('viewBox')).toBeTruthy()
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    expect(svg?.getAttribute('aria-label')).toBe('Square tiling, 400 tiles')
  })

  it('draws one polygon per tile (400 for a 20x20 grid)', () => {
    const { container } = render(<TilingDebugView tiling={squareTiling(20, 20)} />)
    expect(container.querySelectorAll('polygon').length).toBe(400)
  })

  it('shows per-tile number labels only when showNumbers is set', () => {
    const t = squareTiling(20, 20)
    const off = render(<TilingDebugView tiling={t} tileNumber={() => 0} />)
    expect(off.container.querySelectorAll('.tile-num').length).toBe(0)
    const on = render(<TilingDebugView tiling={t} showNumbers tileNumber={() => 7} />)
    expect(on.container.querySelectorAll('.tile-num').length).toBe(400)
  })

  it('shows a visited vN badge whenever a tile has visits, even without numbers', () => {
    const visited = new Map([['sq:1,1', 2]])
    const { container } = render(<TilingDebugView tiling={squareTiling(3, 3)} visited={visited} />)
    expect(container.querySelectorAll('.tile-num').length).toBe(0)
    expect([...container.querySelectorAll('.tile-visited')].map((n) => n.textContent)).toEqual(['v2'])
  })

  it('calls onSelect with the tile id when a tile is clicked', () => {
    const onSelect = vi.fn()
    const { container } = render(<TilingDebugView tiling={squareTiling(3, 3)} onSelect={onSelect} />)
    const poly = container.querySelector('polygon')
    expect(poly).toBeTruthy()
    if (poly) fireEvent.click(poly)
    expect(onSelect).toHaveBeenCalledWith('sq:0,0')
  })

  it('highlights the selected tile with an enlarged overlay (no edge chips)', () => {
    const { container } = render(<TilingDebugView tiling={squareTiling(3, 3)} selectedId="sq:1,1" />)
    expect(container.querySelectorAll('.tiling-selected').length).toBe(1)
    expect(container.querySelectorAll('.edge-chip').length).toBe(0)
  })
})
