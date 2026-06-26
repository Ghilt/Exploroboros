import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
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

  it('hides tile id labels by default and shows them when asked', () => {
    const tiling = squareTiling(20, 20)
    const off = render(<TilingDebugView tiling={tiling} />)
    expect(off.container.querySelectorAll('.tiling-labels text').length).toBe(0)
    const on = render(<TilingDebugView tiling={tiling} showIds />)
    expect(on.container.querySelectorAll('.tiling-labels text').length).toBe(400)
  })

  it('draws boundary edges only when showBoundary is set (80 for 20x20)', () => {
    const tiling = squareTiling(20, 20)
    const off = render(<TilingDebugView tiling={tiling} />)
    expect(off.container.querySelectorAll('.tiling-boundary line').length).toBe(0)
    const on = render(<TilingDebugView tiling={tiling} showBoundary />)
    expect(on.container.querySelectorAll('.tiling-boundary line').length).toBe(80)
  })
})
