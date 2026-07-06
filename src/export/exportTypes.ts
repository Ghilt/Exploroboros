// The message protocol between the main thread and the export Web Worker. Pure types (structurally
// cloneable: a Recipe is plain JSON, a Blob clones by reference), shared by both sides so they can't
// drift. The worker does the heavy build → run → colorize → rasterise; the main thread embeds the
// recipe metadata + downloads.

import type { Recipe } from './recipe'
import type { SizeCaps } from './sizing'
import type { RenderPalette } from './renderTiling'

export type ExportRequest = {
  recipe: Recipe
  palette: RenderPalette
  caps: SizeCaps
  thumbLongEdge: number
}

// The stages of an export, in order. Tracked so a failure can be attributed to a specific step (build
// the tiling → prepare defs/seeds → run the traverse → colour → size → rasterise → encode), which is
// the single most useful thing in a crash debug log. computeExport reports the first five; the
// worker/driver add the render/encode ones; generateExport adds embed-metadata.
export type ExportStage =
  | 'build-tiling'
  | 'prepare'
  | 'run'
  | 'colorize'
  | 'size'
  | 'render'
  | 'thumbnail'
  | 'encode-blob'
  | 'embed-metadata'

export type ExportProgress = { type: 'progress'; ticks: number; live: number }
export type ExportDone = {
  type: 'done'
  full: Blob
  thumb: Blob
  width: number
  height: number
  ticks: number
  hitCap: boolean
  clamped: boolean
}
// A structured worker error: the message plus the underlying error's name/stack and the stage it failed
// in, so the main thread can build a rich debug log even though the error crossed a worker boundary.
export type ExportError = { type: 'error'; message: string; name?: string; stack?: string; stage?: ExportStage }
export type ExportMessage = ExportProgress | ExportDone | ExportError
