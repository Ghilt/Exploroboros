import { describe, it, expect } from 'vitest'
import {
  buildExportDebugReport,
  serializeDebugReport,
  debugLogFilename,
  toErrorInfo,
  type ExportEnvironment,
  type DebugReportInput,
} from './debugReport'
import { DESKTOP_CAPS } from './sizing'
import type { Recipe } from './recipe'

const ENV: ExportEnvironment = {
  userAgent: 'test-agent',
  workerSupported: true,
  offscreenCanvasSupported: true,
}

// A minimal, valid recipe: one built-in Walker seeded on a 6×6 square grid, coloured where visited.
function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    schemaVersion: 7,
    appVersion: '0.1.0',
    app: 'exploroboros',
    tilingId: 'square',
    gridW: 6,
    gridH: 6,
    output: { width: 240, height: 240, edges: false, background: null },
    seeds: [
      { offset: { x: 0, y: 0 }, shape: 'square', heading: 0, def: 'Walker', maxSplit: 1, maxSteps: 50000, movement: 'relative', p: 0, q: 0, r: 0 },
    ],
    paint: [],
    predicates: [],
    traversers: [],
    coloringRules: [{ id: 'r', predicate: { kind: 'ref', id: 'visited' }, color: { kind: 'flat', hex: '#ff0000' }, opacity: 1 }],
    initialState: '',
    numberingScheme: 'left-to-right',
    ...overrides,
  }
}

function input(over: Partial<DebugReportInput> = {}): DebugReportInput {
  return {
    error: { message: 'boom' },
    recipe: recipe(),
    caps: DESKTOP_CAPS,
    environment: ENV,
    progress: null,
    createdAt: '2026-07-06T12:30:00.000Z',
    ...over,
  }
}

describe('toErrorInfo', () => {
  it('reads a plain Error', () => {
    const info = toErrorInfo(new Error('kaboom'))
    expect(info.message).toBe('kaboom')
    expect(info.name).toBe('Error')
    expect(info.stack).toBeTypeOf('string')
    expect(info.path).toBeUndefined()
  })

  it('reads a bare string / unknown', () => {
    expect(toErrorInfo('just a string').message).toBe('just a string')
    expect(toErrorInfo(42).message).toBe('42')
  })

  it('unwraps an ExportFailure-shaped object (cause name/stack win, path + stage + workerEvent kept)', () => {
    const failure = {
      name: 'ExportFailure',
      message: 'Array buffer allocation failed',
      stack: 'ExportFailure: ... (wrapper)',
      path: 'worker',
      stage: 'run',
      causeName: 'RangeError',
      causeStack: 'RangeError: Array buffer allocation failed\n at ...',
      workerEvent: { message: '', filename: 'exportWorker.ts', lineno: 12, colno: 3 },
    }
    const info = toErrorInfo(failure)
    expect(info.message).toBe('Array buffer allocation failed')
    expect(info.name).toBe('RangeError') // the underlying cause, not the 'ExportFailure' wrapper
    expect(info.stack).toContain('RangeError')
    expect(info.path).toBe('worker')
    expect(info.stage).toBe('run')
    expect(info.workerEvent).toEqual({ message: '', filename: 'exportWorker.ts', lineno: 12, colno: 3 })
  })
})

describe('buildExportDebugReport', () => {
  it('embeds the full recipe verbatim and stamps the metadata', () => {
    const r = recipe()
    const report = buildExportDebugReport(input({ recipe: r }))
    expect(report.kind).toBe('exploroboros-export-debug')
    expect(report.recipe).toBe(r) // the whole reproduction is carried, unmodified
    expect(report.appVersion).toBe('0.1.0')
    expect(report.recipeSchemaVersion).toBe(7)
    expect(report.environment).toBe(ENV)
    expect(report.caps).toBe(DESKTOP_CAPS)
    expect(report.createdAt).toBe('2026-07-06T12:30:00.000Z')
  })

  it('re-derives the real tile count and the target canvas size', () => {
    const report = buildExportDebugReport(input({ recipe: recipe({ gridW: 6, gridH: 6 }) }))
    expect(report.diagnostics.tilingBuilt).toBe(true)
    expect(report.diagnostics.tileCount).toBe(36) // 6×6 square
    expect(report.diagnostics.targetCanvas).toEqual({ width: 240, height: 240, clamped: false })
    expect(report.diagnostics.estimatedPixels).toBe(240 * 240)
    expect(report.diagnostics.seedsPlaced).toBe(1)
    expect(report.summary.tileCount).toBe(36)
  })

  it('reports the target canvas as clamped when the request exceeds the caps', () => {
    const report = buildExportDebugReport(input({ recipe: recipe({ output: { width: 20000, height: 20000, edges: false, background: null } }) }))
    expect(report.diagnostics.targetCanvas.clamped).toBe(true)
    expect(Math.max(report.diagnostics.targetCanvas.width, report.diagnostics.targetCanvas.height)).toBeLessThanOrEqual(DESKTOP_CAPS.maxEdge)
  })

  it('compiles each traverser and flags the broken one (a prime failure suspect)', () => {
    const report = buildExportDebugReport(
      input({
        recipe: recipe({
          traversers: [
            { id: 'ok', name: 'Good', text: 'move nearest-unvisited' },
            { id: 'bad', name: 'Broken', text: 'this is not valid dsl ((' },
          ],
        }),
      }),
    )
    const good = report.diagnostics.traversers.find((t) => t.name === 'Good')!
    const bad = report.diagnostics.traversers.find((t) => t.name === 'Broken')!
    expect(good.compiles).toBe(true)
    expect(bad.compiles).toBe(false)
    expect(bad.error).toBeTruthy()
    expect(report.summary.failingTraversers).toEqual(['Broken'])
  })

  it('flags a placed seed pointing at a missing/broken definition', () => {
    const report = buildExportDebugReport(
      input({
        recipe: recipe({
          seeds: [
            { offset: { x: 0, y: 0 }, heading: 0, def: 'Ghost', maxSplit: 1, maxSteps: 100, movement: 'relative', p: 0, q: 0, r: 0 },
          ],
          traversers: [],
        }),
      }),
    )
    expect(report.diagnostics.unresolvedSeedDefs).toContain('Ghost')
  })

  it('does not treat the built-in Walker as an unresolved seed def', () => {
    const report = buildExportDebugReport(input()) // the default recipe seeds the built-in Walker
    expect(report.diagnostics.unresolvedSeedDefs).toEqual([])
  })

  it('reports an initial-state document that fails to compile without throwing', () => {
    const report = buildExportDebugReport(input({ recipe: recipe({ initialState: 'auto-place nonsense {' }) }))
    expect(report.diagnostics.initialState.present).toBe(true)
    expect(report.diagnostics.initialState.compiles).toBe(false)
    expect(report.diagnostics.initialState.error).toBeTruthy()
    expect(report.diagnostics.diagnosticErrors).toEqual([]) // a compile *result* of not-ok is not a diag crash
  })

  it('carries the error and the progress reached through to the summary', () => {
    const report = buildExportDebugReport(
      input({
        error: { message: 'worker died', path: 'worker', stage: 'run' },
        progress: { ticks: 4500, live: 12 },
      }),
    )
    expect(report.summary.errorMessage).toBe('worker died')
    expect(report.summary.path).toBe('worker')
    expect(report.summary.stage).toBe('run')
    expect(report.summary.reachedTicks).toBe(4500)
    expect(report.summary.liveWalkersAtFailure).toBe(12)
    expect(report.progress).toEqual({ ticks: 4500, live: 12 })
  })

  it('never throws and still produces a report for an unknown tiling id (falls back to square)', () => {
    const report = buildExportDebugReport(input({ recipe: recipe({ tilingId: 'does-not-exist' }) }))
    expect(report.summary.tilingId).toBe('does-not-exist')
    expect(report.diagnostics.tilingBuilt).toBe(true) // buildTiling falls back to square, doesn't throw
    expect(report.recipe.tilingId).toBe('does-not-exist')
  })

  it('serializes to valid, round-trippable JSON', () => {
    const report = buildExportDebugReport(input())
    const json = serializeDebugReport(report)
    const parsed = JSON.parse(json)
    expect(parsed.kind).toBe('exploroboros-export-debug')
    expect(parsed.recipe.tilingId).toBe('square')
  })
})

describe('debugLogFilename', () => {
  it('is filesystem-safe (colons/dots from the ISO stamp become dashes)', () => {
    const name = debugLogFilename(recipe(), '2026-07-06T12:30:00.000Z')
    expect(name).toBe('exploroboros-export-error-square-2026-07-06T12-30-00-000Z.json')
    expect(name.replace(/\.json$/, '')).not.toMatch(/[:.]/) // the stem has no colons/dots (the extension may)
  })

  it('sanitizes an exotic tiling id', () => {
    expect(debugLogFilename(recipe({ tilingId: 'weird/id here' }), '2026-01-01T00:00:00.000Z')).toContain('weird-id-here')
  })
})
