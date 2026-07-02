import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { squareTiling, nodeById } from '../tiling'
import { TileMini } from './TileMini'

describe('TileMini', () => {
  it('draws the polygon and numbers every edge 0..N-1, with edge 0 highlighted', () => {
    const node = nodeById(squareTiling(5, 5), 'sq:2,2')!
    const { container } = render(<TileMini node={node} />)
    expect(container.querySelector('svg.tile-mini')).toBeTruthy()
    expect(container.querySelector('polygon.tile-mini-shape')).toBeTruthy()
    const nums = [...container.querySelectorAll('text.tile-mini-num')].map((e) => e.textContent).sort()
    expect(nums).toEqual(['0', '1', '2', '3'])
    expect(container.querySelector('.tile-mini-edge0')).toBeTruthy()
    expect(container.querySelector('text.tile-mini-num.is-zero')?.textContent).toBe('0')
  })

  it('is drawn in the tile orientation — edge 0 is the top (north) edge of a square', () => {
    const node = nodeById(squareTiling(5, 5), 'sq:2,2')!
    const { container } = render(<TileMini node={node} />)
    const line = container.querySelector('.tile-mini-edge0')!
    const y1 = Number(line.getAttribute('y1'))
    const y2 = Number(line.getAttribute('y2'))
    expect(Math.abs(y1 - y2)).toBeLessThan(1e-6) // horizontal edge
    expect(y1).toBeLessThan(-node.centroid.y) // above the centroid (SVG y grows downward)
  })
})
