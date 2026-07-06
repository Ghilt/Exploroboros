// Main-thread glue for the export debug log: gather the running environment (navigator/window), hand it
// to the pure builder (debugReport.ts), serialize, and trigger a download. DOM-dependent, so it is NOT
// part of the pure export graph (not re-exported from index.ts) — the Workspace imports it directly, the
// same way it imports the export driver + download helper.

import { downloadBlob } from './download'
import type { Recipe } from './recipe'
import type { SizeCaps } from './sizing'
import {
  buildExportDebugReport,
  serializeDebugReport,
  debugLogFilename,
  toErrorInfo,
  DEBUG_REPORT_VERSION,
  type ExportEnvironment,
} from './debugReport'

// navigator carries a couple of optional, not-in-lib fields worth capturing for OOM/perf triage.
type NavigatorExtra = Navigator & { deviceMemory?: number; platform?: string }

export function collectExportEnvironment(): ExportEnvironment {
  const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorExtra) : undefined
  const win = typeof window !== 'undefined' ? window : undefined
  return {
    userAgent: nav?.userAgent,
    platform: nav?.platform,
    language: nav?.language,
    hardwareConcurrency: nav?.hardwareConcurrency,
    deviceMemoryGb: nav?.deviceMemory,
    devicePixelRatio: win?.devicePixelRatio,
    maxTouchPoints: nav?.maxTouchPoints,
    screen: typeof screen !== 'undefined' ? { width: screen.width, height: screen.height } : undefined,
    viewport: win ? { width: win.innerWidth, height: win.innerHeight } : undefined,
    workerSupported: typeof Worker !== 'undefined',
    offscreenCanvasSupported: typeof OffscreenCanvas !== 'undefined',
  }
}

export type DebugLogInput = {
  error: unknown
  recipe: Recipe
  caps: SizeCaps
  progress?: { ticks: number; live: number } | null
}

// Build + download the debug log for a failed export. Returns the filename it saved as. Wrapped so the
// download itself can NEVER fail silently — if report assembly somehow throws, it still writes a minimal
// JSON with the error + raw recipe, which is the whole point (the user needs a file to hand over).
export function downloadExportDebugLog(input: DebugLogInput): string {
  const createdAt = new Date().toISOString()
  const environment = collectExportEnvironment()
  const errorInfo = toErrorInfo(input.error)
  let text: string
  try {
    const report = buildExportDebugReport({
      error: errorInfo,
      recipe: input.recipe,
      caps: input.caps,
      environment,
      progress: input.progress ?? null,
      createdAt,
    })
    text = serializeDebugReport(report)
  } catch (e) {
    text = JSON.stringify(
      {
        kind: 'exploroboros-export-debug',
        reportVersion: DEBUG_REPORT_VERSION,
        createdAt,
        note: 'debug report assembly failed — this is the minimal fallback',
        assemblyError: e instanceof Error ? (e.stack ?? e.message) : String(e),
        error: errorInfo,
        environment,
        recipe: input.recipe,
      },
      null,
      2,
    )
  }
  const filename = debugLogFilename(input.recipe, createdAt)
  downloadBlob(new Blob([text], { type: 'application/json' }), filename)
  return filename
}
