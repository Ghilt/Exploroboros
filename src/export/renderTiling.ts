// Rasterise a tiling + its per-tile colours to a 2D canvas, for export. A deliberate, small SUBSET of
// the live Konva `drawTiles` (CLAUDE.md §9 keeps Konva out of pure modules): plane base → colour on top
// → optional edge. No viewport culling (we draw the whole tiling) and no selection/flash. Takes a
// structural 2D context so it works on both an `HTMLCanvasElement` (main-thread fallback) and an
// `OffscreenCanvas` (worker) and is testable with a recording fake — no DOM types needed.
//
// The BACKGROUND is the plane: it's both the canvas backdrop AND the base of every tile, so an unpainted
// (unvisited) tile reads as the background and the coloured (visited) tiles are the fractal sitting ON
// it — like the prototype's `base-color`/`bg`. (Before, tiles had a fixed white base, so a non-white
// background only showed as a border.) `background: null` = transparent: unpainted tiles are left clear,
// so only the fractal is drawn.
//
// Flush (the white-seam bug): with edges OFF, adjacent anti-aliased fills leave a sub-pixel gap that
// leaks the layer beneath. We close it by filling each tile ONCE with its flattened-opaque colour on a
// slightly INFLATED polygon, so neighbours overlap and the later fill covers the seam (see flush.ts).

import type { Tiling, Vec2 } from '../tiling'
import { worldToScreen, flattenColor, inflatePolygon, FLUSH_OVERLAP_PX, type View } from '../canvas'

// The minimal 2D-context surface we use — satisfied by CanvasRenderingContext2D and
// OffscreenCanvasRenderingContext2D alike.
export type RenderCtx = {
  canvas: { width: number; height: number }
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  fill(): void
  stroke(): void
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineJoin: CanvasLineJoin
}

export type RenderPalette = { edge: string }

export type RenderOptions = {
  edges: boolean
  // The plane colour: fills the whole canvas first AND is the base every tile sits on. null =
  // transparent — unpainted tiles are left clear so only the coloured (visited) tiles are drawn.
  background: string | null
  edgeWidth?: number
}

export function renderToCanvas(
  ctx: RenderCtx,
  tiling: Tiling,
  view: View,
  palette: RenderPalette,
  colorFor: ReadonlyMap<string, string>,
  opts: RenderOptions,
): void {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)
  const base = opts.background // the plane colour = every tile's base; null = transparent
  if (base) {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, width, height)
  }

  const edgeW = opts.edgeWidth ?? 1
  // World-space overlap so neighbours' fills meet with no seam (flush mode only).
  const delta = view.scale > 0 ? FLUSH_OVERLAP_PX / view.scale : 0
  ctx.lineJoin = 'round'

  const trace = (vs: ReadonlyArray<Vec2>) => {
    ctx.beginPath()
    const p0 = worldToScreen(vs[0], view)
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < vs.length; i += 1) {
      const p = worldToScreen(vs[i], view)
      ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
  }

  for (const node of tiling.nodes) {
    const fill = colorFor.get(node.id)
    if (opts.edges) {
      // Edges visible: plane base → colour on top → edge stroke (the stroke hides any seam). With a
      // transparent background the base is skipped, so an unpainted tile is just its edge outline.
      trace(node.vertices)
      if (base) {
        ctx.fillStyle = base
        ctx.fill()
      }
      if (fill) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      ctx.lineWidth = edgeW
      ctx.strokeStyle = palette.edge
      ctx.stroke()
    } else {
      // Flush: ONE opaque fill on a slightly inflated polygon. A coloured tile = its colour flattened
      // over the plane; an unpainted tile = the plane colour. Transparent + unpainted → left clear.
      const flat = base ? flattenColor(fill, base) : fill
      if (!flat) continue
      trace(inflatePolygon(node.vertices, node.centroid, delta))
      ctx.fillStyle = flat
      ctx.fill()
    }
  }
}
