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
const palette = { edge: '#000' }
const colorFor = new Map([['sq:0,0', 'rgba(1,2,3,1)']])

describe('renderToCanvas', () => {
  it('edges off, background colour: tile = colour flattened over the plane (flush, no seam stroke)', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, colorFor, { edges: false, background: '#ffffff' })
    // background fills the canvas first; the tile's rgba(1,2,3,1) over white flattens to an opaque rgb.
    expect(ctx.events).toEqual(['clearRect', 'fillRect', 'fill(rgb(1, 2, 3))'])
  })

  it('edges off, transparent: the colour is drawn raw, with NO base under it', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, colorFor, { edges: false, background: null })
    expect(ctx.events).toEqual(['clearRect', 'fill(rgba(1,2,3,1))'])
  })

  it('edges on: plane base → colour → edge stroke', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, colorFor, { edges: true, background: '#222' })
    expect(ctx.events).toEqual(['clearRect', 'fillRect', 'fill(#222)', 'fill(rgba(1,2,3,1))', 'stroke(#000)'])
  })

  it('an UNPAINTED tile takes the background colour, flush', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, new Map(), { edges: false, background: '#000000' })
    // black background fill, then the unpainted tile fills black too (the plane) — no white.
    expect(ctx.events).toEqual(['clearRect', 'fillRect', 'fill(rgb(0, 0, 0))'])
  })

  it('an unpainted tile on a TRANSPARENT background is left clear (skipped)', () => {
    const ctx = new RecCtx()
    renderToCanvas(ctx, tiling, view, palette, new Map(), { edges: false, background: null })
    expect(ctx.events).toEqual(['clearRect'])
  })
})
