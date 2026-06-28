// The export Web Worker: off the main thread so a big, slow generation never freezes the interactive
// canvas. It imports ONLY pure modules (no React/Konva/DOM beyond OffscreenCanvas), does the whole
// build → remap → run → colorize → rasterise, and posts back the full PNG blob + a small thumbnail.
// The main thread (exportImage.ts) embeds the recipe metadata + triggers the download.
//
// Typed without the WebWorker lib (tsconfig only has DOM): we cast the worker global to a minimal
// scope interface. OffscreenCanvas/OffscreenCanvasRenderingContext2D come from the DOM lib.

import { computeExport } from './generate'
import { renderToCanvas } from './renderTiling'
import type { ExportRequest, ExportMessage } from './exportTypes'

type WorkerScope = {
  onmessage: ((e: MessageEvent<ExportRequest>) => void) | null
  postMessage(message: ExportMessage): void
}
const worker = self as unknown as WorkerScope

worker.onmessage = (e) => {
  const req = e.data
  try {
    const { recipe, palette, caps, thumbLongEdge } = req
    const result = computeExport(recipe, caps, (ticks, live) =>
      worker.postMessage({ type: 'progress', ticks, live }),
    )
    const { tiling, colorFor, size } = result

    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')
    renderToCanvas(ctx, tiling, size.view, palette, colorFor, {
      edges: recipe.output.edges,
      background: recipe.output.background,
    })

    const scale = Math.min(1, thumbLongEdge / Math.max(size.width, size.height))
    const tw = Math.max(1, Math.round(size.width * scale))
    const th = Math.max(1, Math.round(size.height * scale))
    const thumbCanvas = new OffscreenCanvas(tw, th)
    const tctx = thumbCanvas.getContext('2d')
    if (!tctx) throw new Error('OffscreenCanvas 2D context unavailable')
    tctx.drawImage(canvas, 0, 0, tw, th)

    Promise.all([
      canvas.convertToBlob({ type: 'image/png' }),
      thumbCanvas.convertToBlob({ type: 'image/png' }),
    ])
      .then(([full, thumb]) => {
        worker.postMessage({
          type: 'done',
          full,
          thumb,
          width: size.width,
          height: size.height,
          ticks: result.ticks,
          hitCap: result.hitCap,
          clamped: size.clamped,
        })
      })
      .catch((err: unknown) => {
        worker.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      })
  } catch (err) {
    worker.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
