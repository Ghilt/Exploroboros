// Main-thread orchestrator for an export. Prefers the Web Worker (no UI jank on big, slow runs);
// falls back to a main-thread render when Worker/OffscreenCanvas aren't available. After the pixels
// exist, it embeds the recipe JSON into the PNG metadata (so the image can later be reopened) and
// hands back the blobs. DOM-dependent (Worker/canvas/Blob) — NOT imported by the worker or pure
// modules, so it never pollutes the isomorphic graph.

import type { Recipe } from './recipe'
import { encodeRecipeToPng } from './pngText'
import { computeExport } from './generate'
import { renderToCanvas, type RenderPalette } from './renderTiling'
import type { SizeCaps } from './sizing'
import type { ExportRequest, ExportMessage } from './exportTypes'

const THUMB_LONG_EDGE = 320

export type ExportParams = {
  recipe: Recipe
  palette: RenderPalette
  caps: SizeCaps
  onProgress?: (ticks: number, live: number) => void
}

export type ExportOutcome = {
  full: Blob // PNG WITH the recipe metadata embedded
  thumb: Blob
  width: number
  height: number
  ticks: number
  hitCap: boolean
  clamped: boolean
}

type RawOutcome = Omit<ExportOutcome, 'full'> & { full: Blob }

function canUseWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
}

// A standard AbortError so callers can branch on `e.name === 'AbortError'` to treat a user cancel as
// "no result" rather than a failure.
export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}
function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Export aborted', 'AbortError')
  const e = new Error('Export aborted')
  e.name = 'AbortError'
  return e
}

export async function generateExport(params: ExportParams, signal?: AbortSignal): Promise<ExportOutcome> {
  if (signal?.aborted) throw abortError()
  const raw = canUseWorker() ? await viaWorker(params, signal) : await viaMainThread(params, signal)
  // Embed the recipe so the saved PNG can be reopened later (fast-follow). Cheap byte work on the
  // already-rendered blob.
  const bytes = new Uint8Array(await raw.full.arrayBuffer())
  const withMeta = encodeRecipeToPng(bytes, JSON.stringify(params.recipe))
  return { ...raw, full: new Blob([withMeta], { type: 'image/png' }) }
}

// Abort terminates the worker mid-run (the whole point of running off-thread — a big generation can be
// killed instantly), and rejects with an AbortError.
function viaWorker(params: ExportParams, signal?: AbortSignal): Promise<RawOutcome> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const onAbort = () => {
      worker.terminate()
      cleanup()
      reject(abortError())
    }
    if (signal) {
      if (signal.aborted) {
        worker.terminate()
        reject(abortError())
        return
      }
      signal.addEventListener('abort', onAbort)
    }
    worker.onmessage = (e: MessageEvent<ExportMessage>) => {
      const m = e.data
      if (m.type === 'progress') {
        params.onProgress?.(m.ticks, m.live)
      } else if (m.type === 'done') {
        cleanup()
        worker.terminate()
        resolve({ full: m.full, thumb: m.thumb, width: m.width, height: m.height, ticks: m.ticks, hitCap: m.hitCap, clamped: m.clamped })
      } else {
        cleanup()
        worker.terminate()
        reject(new Error(m.message))
      }
    }
    worker.onerror = (e) => {
      cleanup()
      worker.terminate()
      reject(new Error(e.message || 'export worker failed'))
    }
    const req: ExportRequest = { recipe: params.recipe, palette: params.palette, caps: params.caps, thumbLongEdge: THUMB_LONG_EDGE }
    worker.postMessage(req)
  })
}

function raf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null — canvas may be too large for this device'))), 'image/png')
  })
}

// Fallback path: same pure pipeline, rendered to a detached <canvas> on the main thread. Yields once
// so the UI can paint a "rendering" state before the (possibly heavy) synchronous run. Abort here is
// best-effort: the run is one blocking synchronous call that can't be interrupted, so we can only honour
// an abort at the yield points around it (the worker path aborts mid-run).
async function viaMainThread(params: ExportParams, signal?: AbortSignal): Promise<RawOutcome> {
  await raf()
  if (signal?.aborted) throw abortError()
  const result = computeExport(params.recipe, params.caps, params.onProgress)
  if (signal?.aborted) throw abortError()
  const { tiling, colorFor, size } = result

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  renderToCanvas(ctx, tiling, size.view, params.palette, colorFor, {
    edges: params.recipe.output.edges,
    background: params.recipe.output.background,
  })
  const full = await canvasToBlob(canvas)

  const scale = Math.min(1, THUMB_LONG_EDGE / Math.max(size.width, size.height))
  const tcanvas = document.createElement('canvas')
  tcanvas.width = Math.max(1, Math.round(size.width * scale))
  tcanvas.height = Math.max(1, Math.round(size.height * scale))
  const tctx = tcanvas.getContext('2d')
  if (!tctx) throw new Error('2D canvas context unavailable')
  tctx.drawImage(canvas, 0, 0, tcanvas.width, tcanvas.height)
  const thumb = await canvasToBlob(tcanvas)

  return { full, thumb, width: size.width, height: size.height, ticks: result.ticks, hitCap: result.hitCap, clamped: size.clamped }
}
