// The pure heart of an export: a Recipe in, a per-tile colour map + the canvas size to draw it at,
// out. No DOM — the actual rasterisation (renderToCanvas onto an OffscreenCanvas/HTMLCanvasElement)
// and PNG encoding happen in the worker / main-thread driver. Isomorphic, so this whole computation
// runs under Vitest and inside a Web Worker.

import type { Tiling } from '../tiling'
import { numberingFor } from '../tiling'
import { buildTiling } from '../canvas'
import { colorize } from '../colorizer'
import type { Recipe } from './recipe'
import type { ExportStage } from './exportTypes'
import { prepareFromRecipe } from './prepare'
import { runToCompletion } from './runToCompletion'
import { pickCanvasSize, type SizeCaps, type CanvasSize } from './sizing'

export type ComputeResult = {
  tiling: Tiling
  colorFor: Map<string, string>
  size: CanvasSize
  ticks: number
  hitCap: boolean
}

// Build the export tiling, run the traverse to completion, colour it, and size the output canvas.
// `onProgress(ticks, liveCount)` is called periodically during the (potentially long) run.
// `onStage(stage)` is called as each step begins, so a caller (the worker / main-thread driver) can
// attribute a thrown error to the exact stage it failed in — see the export debug log.
export function computeExport(
  recipe: Recipe,
  caps: SizeCaps,
  onProgress?: (ticks: number, liveCount: number) => void,
  onStage?: (stage: ExportStage) => void,
): ComputeResult {
  onStage?.('build-tiling')
  const tiling = buildTiling(recipe.tilingId, recipe.gridW, recipe.gridH)
  onStage?.('prepare')
  const prep = prepareFromRecipe(recipe, tiling)
  onStage?.('run')
  const run = runToCompletion(
    tiling,
    prep.seeds,
    prep.baseOverlay,
    prep.defs,
    prep.indexById,
    undefined,
    onProgress,
    numberingFor(tiling, recipe.numberingScheme ?? 'normal'),
  )
  onStage?.('colorize')
  const colorFor = colorize(recipe.coloringRules, prep.predicateText, prep.predicateNames, tiling, run.overlay, prep.indexById)
  onStage?.('size')
  const size = pickCanvasSize(tiling.bounds, recipe.output.width, recipe.output.height, caps)
  return { tiling, colorFor, size, ticks: run.ticks, hitCap: run.hitCap }
}
