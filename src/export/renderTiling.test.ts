import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import type { View } from '../canvas'
import { renderToCanvas, type RenderCtx } from './renderTiling'

// A recording 2D context: captures the order of style sets, fills, strokes — enough to assert the
// fill order + the flush-seam behaviour without a real canvas (jsdom has none).
class RecCtx implements RenderCtx {
  canvas = { width: 100, height: 100 }
  events: string[] = []
  lineWidth = 1
  lineJoin: CanvasLineJoin = 'miter'
  private _fill = ''
  private _stroke = ''
  get fillStyle(): string | CanvasGradient | CanvasPattern {
    return this._fill
  }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) {
    this._fill = String(v)
  }
  get strokeStyle(): string | CanvasGradient | CanvasPattern {
    return this._stroke
  }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) {
    this._stroke = String(v)
  }
  clearRect(): void {
    this.events.push('clearRect')
  }
  fillRect(): void {
    this.events.push('fillRect')
  }
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  fill(): void {
    this.events.push(`fill(${this._fill})`)
  }
  stroke(): void {
    this.events.push(`stroke(${this._stroke})`)
  }
}

const tiling = buildTiling('square', 1) // one tile, id 'sq:0,0'
const view: View = { scale: 50, tx: 0, ty: 0 }
const palette = { tile: '#fff', edge: '#000' }
const colorFor = new Map([['sq:0,0', 'rgba(1,2,3,1)']])

describe('renderToCanvas', () => {
  it('edges off: ONE flattened opaque fill per tile (flush — overlap, no seam stroke)', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, colorFor, { edges: false, background: null })
    // rgba(1,2,3,1) over #fff flattens to an opaque rgb; no per-tile stroke.
    expect(ctx.events).toEqual(['clearRect', 'fill(rgb(1, 2, 3))'])
  })

  it('edges on: base fill → colour fill → edge stroke, and no same-colour seam strokes', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, colorFor, { edges: true, background: null })
    expect(ctx.events).toEqual(['clearRect', 'fill(#fff)', 'fill(rgba(1,2,3,1))', 'stroke(#000)'])
  })

  it('fills the background first when one is given', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, new Map(), { edges: false, background: '#222' })
    expect(ctx.events.slice(0, 2)).toEqual(['clearRect', 'fillRect'])
  })

  it('an unmatched tile (no colorFor) fills the base colour, flush', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, new Map(), { edges: false, background: null })
    expect(ctx.events).toEqual(['clearRect', 'fill(rgb(255, 255, 255))'])
  })
})
