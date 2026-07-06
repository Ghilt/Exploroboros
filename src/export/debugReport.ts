// Assembles a rich, self-contained debug report for a FAILED export — everything a developer needs to
// understand (and reproduce) the failure without the original session: the exact error + which stage it
// died in, the full recipe (traverser definitions, coloring rules, initial-state DSL, predicates, seeds,
// hand-paint, tiling, grid, output settings), the running environment, and best-effort diagnostics
// re-derived from the recipe (real tile count, the output canvas size the caps would have allowed, and
// a per-traverser compile check — a broken traverser is a prime suspect).
//
// Pure & isomorphic (no DOM): it re-runs only CHEAP, pure pieces of the pipeline (build the tiling,
// compile each DSL program, size math) — never the traverse itself — and every one of those is guarded
// so a diagnostic that throws is recorded, not propagated. The core report (error + recipe + env) is
// therefore always produced. The DOM side (gather `navigator`/`window`, serialize, download) lives in
// debugLog.ts.

import type { Bounds } from '../tiling'
import { buildTiling } from '../canvas'
import { compileProgram } from '../traverse'
import { compileDoc } from '../initstate'
import type { ParseError } from '../dsl/types'
import type { Recipe } from './recipe'
import { RECIPE_SCHEMA_VERSION, APP_VERSION } from './recipe'
import type { ExportStage } from './exportTypes'
import { buildPredicateNames, remapSeeds } from './prepare'
import { clampResolution, pickCanvasSize, type SizeCaps } from './sizing'

export const DEBUG_REPORT_VERSION = 1
const BUILTIN_WALKER = 'Walker' // the always-available seed def (lives in no store — see prepare.ts)

// Normalised error info, extracted from whatever was thrown (an ExportFailure, a plain Error, a string).
export type ExportErrorInfo = {
  message: string
  // The underlying error's name/stack (an ExportFailure carries the real cause here; its own name is
  // just 'ExportFailure' and its stack points at the wrapper, so prefer the cause when present).
  name?: string
  stack?: string
  // Which render path ran, and how far it got, when known (an ExportFailure carries these).
  path?: 'worker' | 'main-thread'
  stage?: ExportStage
  // For a bare worker crash (onerror) with no structured payload — whatever the ErrorEvent carried.
  workerEvent?: { message?: string; filename?: string; lineno?: number; colno?: number }
}

// The running environment — gathered on the main thread (debugLog.ts) and passed in so this stays pure.
export type ExportEnvironment = {
  userAgent?: string
  platform?: string
  language?: string
  hardwareConcurrency?: number
  deviceMemoryGb?: number
  devicePixelRatio?: number
  maxTouchPoints?: number
  screen?: { width: number; height: number }
  viewport?: { width: number; height: number }
  workerSupported: boolean
  offscreenCanvasSupported: boolean
}

export type TraverserDiag = {
  name: string
  textLength: number
  compiles: boolean
  error?: string
  // How many placed seeds reference this definition (a broken def with seeds → dropped walkers).
  seedRefCount: number
}

export type ExportDiagnostics = {
  tilingBuilt: boolean
  tileCount?: number
  bounds?: Bounds
  // The output pixel size a successful export would have used (request clamped to the device caps).
  targetCanvas: { width: number; height: number; clamped: boolean }
  estimatedPixels: number
  seedsPlaced?: number
  traversers: TraverserDiag[]
  // Seed `def`s that resolve to neither the built-in Walker nor a compiling recipe traverser.
  unresolvedSeedDefs: string[]
  initialState: { present: boolean; compiles: boolean; error?: string; lineCount: number }
  // Any diagnostic step that itself threw (so the report reflects that we couldn't compute it).
  diagnosticErrors: string[]
}

export type ExportDebugReport = {
  kind: 'exploroboros-export-debug'
  reportVersion: number
  createdAt: string
  appVersion: string
  recipeSchemaVersion: number
  // The headline facts, up top, so a human can skim without reading the whole tree.
  summary: {
    errorMessage: string
    path?: 'worker' | 'main-thread'
    stage?: ExportStage
    tilingId: string
    grid: { w: number; h: number }
    requestedResolution: { width: number; height: number }
    targetResolution: { width: number; height: number; clamped: boolean }
    estimatedPixels: number
    tileCount?: number
    reachedTicks?: number
    liveWalkersAtFailure?: number
    seedCount: number
    paintCount: number
    traverserCount: number
    failingTraversers: string[]
    coloringRuleCount: number
    predicateCount: number
  }
  error: ExportErrorInfo
  environment: ExportEnvironment
  caps: SizeCaps
  // How far the run got before it died (last progress tick reported), if any.
  progress: { ticks: number; live: number } | null
  diagnostics: ExportDiagnostics
  // The full reproduction — last because it's the biggest. A developer can re-import this verbatim.
  recipe: Recipe
}

export type DebugReportInput = {
  error: ExportErrorInfo
  recipe: Recipe
  caps: SizeCaps
  environment: ExportEnvironment
  progress: { ticks: number; live: number } | null
  createdAt: string
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function formatParseError(err: ParseError): string {
  return `${err.message} (chars ${err.span.start}–${err.span.end})`
}

function countLines(text: string): number {
  return text.split('\n').filter((l) => l.trim().length > 0).length
}

// Extract normalised error info from anything thrown by the export path. Duck-types an ExportFailure
// (reads path/stage/cause/workerEvent) so this module needn't import the DOM-side class; falls back to
// a plain Error's message/name/stack, then to String(e).
export function toErrorInfo(e: unknown): ExportErrorInfo {
  if (e && typeof e === 'object') {
    const anyE = e as Record<string, unknown>
    const info: ExportErrorInfo = {
      message: typeof anyE.message === 'string' && anyE.message.length > 0 ? anyE.message : String(e),
    }
    if (typeof anyE.name === 'string') info.name = anyE.name
    if (typeof anyE.stack === 'string') info.stack = anyE.stack
    // An ExportFailure carries the real cause separately — it wins over the wrapper's own name/stack.
    if (typeof anyE.causeName === 'string') info.name = anyE.causeName
    if (typeof anyE.causeStack === 'string') info.stack = anyE.causeStack
    if (anyE.path === 'worker' || anyE.path === 'main-thread') info.path = anyE.path
    if (typeof anyE.stage === 'string') info.stage = anyE.stage as ExportStage
    if (anyE.workerEvent && typeof anyE.workerEvent === 'object') {
      info.workerEvent = anyE.workerEvent as ExportErrorInfo['workerEvent']
    }
    return info
  }
  return { message: String(e) }
}

// Best-effort diagnostics: re-derive the cheap, pure parts of the pipeline from the recipe. Every step
// is guarded — a throw is recorded in `diagnosticErrors`, never propagated — so the caller always gets a
// report. The traverse itself is deliberately NOT re-run (it's the heavy/likely-culprit step).
function collectDiagnostics(recipe: Recipe, caps: SizeCaps): ExportDiagnostics {
  const diagnosticErrors: string[] = []

  // Output size the caps allow — pure math, never needs the tiling, so it's always available.
  let targetCanvas = { width: 0, height: 0, clamped: false }
  try {
    targetCanvas = clampResolution(recipe.output.width, recipe.output.height, caps)
  } catch (e) {
    diagnosticErrors.push(`clampResolution: ${errMsg(e)}`)
  }

  // Tiling-dependent facts (real tile count / bounds / placed seeds / an accurate target size). Built
  // in a guard: on a big grid this repeats work the export already did, so if THIS throws it's a strong
  // signal (and we still have everything else).
  let tilingBuilt = false
  let tileCount: number | undefined
  let bounds: Bounds | undefined
  let seedsPlaced: number | undefined
  try {
    const tiling = buildTiling(recipe.tilingId, recipe.gridW, recipe.gridH)
    tilingBuilt = true
    tileCount = tiling.nodes.length
    bounds = tiling.bounds
    try {
      const sized = pickCanvasSize(tiling.bounds, recipe.output.width, recipe.output.height, caps)
      targetCanvas = { width: sized.width, height: sized.height, clamped: sized.clamped }
    } catch (e) {
      diagnosticErrors.push(`pickCanvasSize: ${errMsg(e)}`)
    }
    try {
      seedsPlaced = remapSeeds(recipe.seeds, tiling).length
    } catch (e) {
      diagnosticErrors.push(`remapSeeds: ${errMsg(e)}`)
    }
  } catch (e) {
    diagnosticErrors.push(`buildTiling(${recipe.tilingId}, ${recipe.gridW}×${recipe.gridH}): ${errMsg(e)}`)
  }

  // Per-traverser compile check — cheap, no tiling. A definition that fails to compile here is the most
  // likely cause of an export that behaves differently from the live canvas.
  let names = new Map<string, string>()
  try {
    names = buildPredicateNames(recipe.predicates)
  } catch (e) {
    diagnosticErrors.push(`buildPredicateNames: ${errMsg(e)}`)
  }

  const seedDefCounts = new Map<string, number>()
  for (const s of recipe.seeds) seedDefCounts.set(s.def, (seedDefCounts.get(s.def) ?? 0) + 1)

  const traversers: TraverserDiag[] = recipe.traversers.map((t) => {
    let compiles = false
    let error: string | undefined
    try {
      const c = compileProgram(t.text, names)
      compiles = c.ok
      if (!c.ok) error = formatParseError(c.error)
    } catch (e) {
      error = `compile threw: ${errMsg(e)}`
      diagnosticErrors.push(`compileProgram(${t.name}): ${errMsg(e)}`)
    }
    return { name: t.name, textLength: t.text.length, compiles, error, seedRefCount: seedDefCounts.get(t.name) ?? 0 }
  })

  const compilingNames = new Set(traversers.filter((t) => t.compiles).map((t) => t.name))
  compilingNames.add(BUILTIN_WALKER)
  const unresolvedSeedDefs = [...seedDefCounts.keys()].filter((d) => !compilingNames.has(d))

  const initText = recipe.initialState ?? ''
  let initCompiles = false
  let initError: string | undefined
  try {
    const doc = compileDoc(initText, names)
    initCompiles = doc.ok
    if (!doc.ok) initError = formatParseError(doc.error)
  } catch (e) {
    initError = `compile threw: ${errMsg(e)}`
    diagnosticErrors.push(`compileDoc: ${errMsg(e)}`)
  }

  return {
    tilingBuilt,
    tileCount,
    bounds,
    targetCanvas,
    estimatedPixels: targetCanvas.width * targetCanvas.height,
    seedsPlaced,
    traversers,
    unresolvedSeedDefs,
    initialState: { present: initText.trim().length > 0, compiles: initCompiles, error: initError, lineCount: countLines(initText) },
    diagnosticErrors,
  }
}

export function buildExportDebugReport(input: DebugReportInput): ExportDebugReport {
  const { error, recipe, caps, environment, progress, createdAt } = input
  const diagnostics = collectDiagnostics(recipe, caps)
  const failingTraversers = diagnostics.traversers.filter((t) => !t.compiles).map((t) => t.name)

  return {
    kind: 'exploroboros-export-debug',
    reportVersion: DEBUG_REPORT_VERSION,
    createdAt,
    appVersion: recipe.appVersion ?? APP_VERSION,
    recipeSchemaVersion: recipe.schemaVersion ?? RECIPE_SCHEMA_VERSION,
    summary: {
      errorMessage: error.message,
      path: error.path,
      stage: error.stage,
      tilingId: recipe.tilingId,
      grid: { w: recipe.gridW, h: recipe.gridH },
      requestedResolution: { width: recipe.output.width, height: recipe.output.height },
      targetResolution: diagnostics.targetCanvas,
      estimatedPixels: diagnostics.estimatedPixels,
      tileCount: diagnostics.tileCount,
      reachedTicks: progress?.ticks,
      liveWalkersAtFailure: progress?.live,
      seedCount: recipe.seeds.length,
      paintCount: recipe.paint.length,
      traverserCount: recipe.traversers.length,
      failingTraversers,
      coloringRuleCount: recipe.coloringRules.length,
      predicateCount: recipe.predicates.length,
    },
    error,
    environment,
    caps,
    progress,
    diagnostics,
    recipe,
  }
}

export function serializeDebugReport(report: ExportDebugReport): string {
  return JSON.stringify(report, null, 2)
}

// A filesystem-safe debug-log filename, e.g. "exploroboros-export-error-square-2026-07-06T12-30-00.json".
export function debugLogFilename(recipe: Recipe, createdAt: string): string {
  const safeTiling = recipe.tilingId.replace(/[^a-z0-9-]+/gi, '-')
  const stamp = createdAt.replace(/[:.]/g, '-').replace(/[^0-9a-z-]/gi, '-')
  return `exploroboros-export-error-${safeTiling}-${stamp}.json`
}
