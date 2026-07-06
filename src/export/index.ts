// Public surface of the pure export core (no Konva; no DOM except the orchestrator/driver, which live
// in separate files). The worker, the main-thread fallback, and the UI import from here.

export { runToCompletion, type RunResult } from './runToCompletion'
export { boundsCenter, tileOffset, placeOffset } from './remap'
export { pickCanvasSize, DESKTOP_CAPS, MOBILE_CAPS, type SizeCaps, type CanvasSize } from './sizing'
export { renderToCanvas, type RenderCtx, type RenderPalette, type RenderOptions } from './renderTiling'
export {
  RECIPE_SCHEMA_VERSION,
  APP_VERSION,
  RECIPE_KEYWORD,
  buildRecipe,
  parseRecipe,
  migrateRecipe,
  type Recipe,
  type RecipeSeed,
  type RecipePaint,
  type RecipeOutput,
  type RecipeInput,
  type Migration,
  type ParseResult,
  type ParseFailure,
} from './recipe'
export {
  prepareFromRecipe,
  buildIndexById,
  buildPredicateText,
  buildDefs,
  remapSeeds,
  remapPaint,
  type Prepared,
} from './prepare'
export { computeExport, type ComputeResult } from './generate'
export { embedText, readText, encodeRecipeToPng, decodeRecipeFromPng } from './pngText'
export { clampResolution } from './sizing'
export type { ExportStage } from './exportTypes'
export {
  buildExportDebugReport,
  serializeDebugReport,
  debugLogFilename,
  toErrorInfo,
  DEBUG_REPORT_VERSION,
  type ExportDebugReport,
  type ExportErrorInfo,
  type ExportEnvironment,
  type ExportDiagnostics,
  type TraverserDiag,
  type DebugReportInput,
} from './debugReport'
