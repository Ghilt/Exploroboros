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
export type ExportError = { type: 'error'; message: string }
export type ExportMessage = ExportProgress | ExportDone | ExportError
