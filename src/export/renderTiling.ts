// Rasterise a tiling + its per-tile colours to a 2D canvas, for export. A deliberate, small SUBSET of
// the live Konva `drawTiles` (CLAUDE.md §9 keeps Konva out of pure modules): base fill → colour on top
// → optional edge. No viewport culling (we draw the whole tiling) and no selection/flash. Takes a
// structural 2D context so it works on both an `HTMLCanvasElement` (main-thread fallback) and an
// `OffscreenCanvas` (worker) and is testable with a recording fake — no DOM types needed.
//
// FILL ORDER must stay in lockstep with drawTiles in TilingCanvas.tsx: base (pal.tile) then the
// colorFor colour (carries its own alpha, blends over the base).
//
// Flush fix (the white-seam bug): with edges OFF, adjacent polygon fills leave a sub-pixel
// anti-alias gap that shows the background through. We close it by stroking each tile with the SAME
// colour as its fill — invisible cosmetically (same colour) but it covers the seam so tiles read flush.

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

export type RenderPalette = { tile: string; edge: string }

export type RenderOptions = {
  edges: boolean
  // null = transparent (clear); a CSS colour fills the whole canvas first (themed/solid background).
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
  if (opts.background) {
    ctx.fillStyle = opts.background
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
    if (opts.edges) {
      // Edges visible: base fill → colour on top → black edge (the stroke hides any seam).
      trace(node.vertices)
      ctx.fillStyle = palette.tile
      ctx.fill()
      const fill = colorFor.get(node.id)
      if (fill) {
        ctx.fillStyle = fill
        ctx.fill()
      }
      ctx.lineWidth = edgeW
      ctx.strokeStyle = palette.edge
      ctx.stroke()
    } else {
      // Flush: ONE opaque fill on a slightly inflated polygon, so adjacent tiles overlap and no
      // anti-alias seam can show the background through (see flush.ts).
      trace(inflatePolygon(node.vertices, node.centroid, delta))
      ctx.fillStyle = flattenColor(colorFor.get(node.id), palette.tile)
      ctx.fill()
    }
  }
}
