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
import type { ExportRequest, ExportMessage, ExportStage } from './exportTypes'

const THUMB_LONG_EDGE = 320

// The one common, NON-bug export failure: the worker's code couldn't load/start. Its bundle is a
// separate, content-hashed chunk fetched lazily on the first export, so a redeploy that renamed it (a new
// content hash) leaves an already-open tab requesting a now-404 URL — the export "just breaks" until a
// reload. So we surface an ACTIONABLE message rather than a cryptic one, and (unlike a real compute/render
// bug) skip the developer debug log — reloading is the fix, not filing a report.
export const WORKER_UNAVAILABLE_MESSAGE =
  'Could not start the export helper. Exploroboros was most likely updated since you opened this page — reload it (Ctrl+Shift+R, or Cmd+Shift+R on a Mac) and export again.'

// Fields carried by a failed export so the caller can build a rich debug log: which path ran
// (off-thread worker vs main-thread fallback), which stage failed, the underlying error's name/stack
// (the wrapper's own stack points here, not at the real cause), and — for a bare worker `onerror`
// crash with no structured payload — whatever the ErrorEvent gave us. `workerUnavailable` flags the
// load/start failure above so the UI shows the reload hint + skips the debug log.
export type ExportFailureInit = {
  path: 'worker' | 'main-thread'
  stage?: ExportStage
  causeName?: string
  causeStack?: string
  workerEvent?: { message?: string; filename?: string; lineno?: number; colno?: number }
  workerUnavailable?: boolean
}

// A non-abort export failure. Duck-typed by the debug log (toErrorInfo reads path/stage/cause off it),
// so this class stays in the DOM-side driver and never needs importing by the pure report builder.
export class ExportFailure extends Error {
  readonly path: 'worker' | 'main-thread'
  readonly stage?: ExportStage
  readonly causeName?: string
  readonly causeStack?: string
  readonly workerEvent?: ExportFailureInit['workerEvent']
  readonly workerUnavailable?: boolean
  constructor(message: string, init: ExportFailureInit) {
    super(message)
    this.name = 'ExportFailure'
    this.path = init.path
    this.stage = init.stage
    this.causeName = init.causeName
    this.causeStack = init.causeStack
    this.workerEvent = init.workerEvent
    this.workerUnavailable = init.workerUnavailable
  }
}

// True when the export failed because the WORKER couldn't load/start (stale chunk after a redeploy, or a
// CSP blocking it) — a reload fixes it, so the UI shows the hint instead of a debug log.
export function isWorkerUnavailable(e: unknown): boolean {
  return e instanceof ExportFailure && e.workerUnavailable === true
}

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
  const useWorker = canUseWorker()
  const raw = useWorker ? await viaWorker(params, signal) : await viaMainThread(params, signal)
  // Embed the recipe so the saved PNG can be reopened later. Cheap byte work on the already-rendered
  // blob — but a corrupt/huge blob can still throw here, so attribute it to the metadata stage.
  try {
    const bytes = new Uint8Array(await raw.full.arrayBuffer())
    const withMeta = encodeRecipeToPng(bytes, JSON.stringify(params.recipe))
    return { ...raw, full: new Blob([withMeta], { type: 'image/png' }) }
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new ExportFailure(err instanceof Error ? err.message : String(err), {
      path: useWorker ? 'worker' : 'main-thread',
      stage: 'embed-metadata',
      causeName: err instanceof Error ? err.name : undefined,
      causeStack: err instanceof Error ? err.stack : undefined,
    })
  }
}

// Abort terminates the worker mid-run (the whole point of running off-thread — a big generation can be
// killed instantly), and rejects with an AbortError.
function viaWorker(params: ExportParams, signal?: AbortSignal): Promise<RawOutcome> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      // Couldn't even construct the worker (e.g. a CSP that blocks worker-src) — same user-facing cause
      // as a failed load: the helper can't start. Surface the actionable reload message.
      reject(new ExportFailure(WORKER_UNAVAILABLE_MESSAGE, { path: 'worker', workerUnavailable: true, causeName: e instanceof Error ? e.name : undefined, causeStack: e instanceof Error ? e.stack : undefined }))
      return
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    const onAbort = () => {
      worker.terminate()
      cleanup()
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort)
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
        reject(new ExportFailure(m.message, { path: 'worker', stage: m.stage, causeName: m.name, causeStack: m.stack }))
      }
    }
    // A BARE worker crash — empty/opaque ErrorEvent, no structured payload. The dominant cause is the
    // helper's code CHUNK failing to load: it's a separate content-hashed file fetched lazily on the first
    // export, so a redeploy that renamed it 404s an already-open tab. (A genuine compute/render throw comes
    // back as a STRUCTURED 'error' message above — the worker's whole body is try/caught and the async
    // encode is .catch'd — so it does not land here.) Surface the actionable reload message (a reload
    // fetches the current app + its matching helper chunk); deliberately NOT a silent main-thread fallback.
    worker.onerror = (e) => {
      cleanup()
      worker.terminate()
      reject(
        new ExportFailure(WORKER_UNAVAILABLE_MESSAGE, {
          path: 'worker',
          workerUnavailable: true,
          workerEvent: { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno },
        }),
      )
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
  let stage: ExportStage = 'build-tiling'
  try {
    await raf()
    if (signal?.aborted) throw abortError()
    const result = computeExport(params.recipe, params.caps, params.onProgress, (s) => {
      stage = s
    })
    if (signal?.aborted) throw abortError()
    const { tiling, colorFor, size } = result

    stage = 'render'
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    renderToCanvas(ctx, tiling, size.view, params.palette, colorFor, {
      edges: params.recipe.output.edges,
      background: params.recipe.output.background,
    })
    stage = 'encode-blob'
    const full = await canvasToBlob(canvas)

    stage = 'thumbnail'
    const scale = Math.min(1, THUMB_LONG_EDGE / Math.max(size.width, size.height))
    const tcanvas = document.createElement('canvas')
    tcanvas.width = Math.max(1, Math.round(size.width * scale))
    tcanvas.height = Math.max(1, Math.round(size.height * scale))
    const tctx = tcanvas.getContext('2d')
    if (!tctx) throw new Error('2D canvas context unavailable')
    tctx.drawImage(canvas, 0, 0, tcanvas.width, tcanvas.height)
    stage = 'encode-blob'
    const thumb = await canvasToBlob(tcanvas)

    return { full, thumb, width: size.width, height: size.height, ticks: result.ticks, hitCap: result.hitCap, clamped: size.clamped }
  } catch (err) {
    if (isAbortError(err)) throw err // a user cancel is not a failure — keep it an AbortError
    throw new ExportFailure(err instanceof Error ? err.message : String(err), {
      path: 'main-thread',
      stage,
      causeName: err instanceof Error ? err.name : undefined,
      causeStack: err instanceof Error ? err.stack : undefined,
    })
  }
}
