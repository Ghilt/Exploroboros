import { describe, it, expect } from 'vitest'
import { ExportFailure, isWorkerUnavailable, isAbortError, WORKER_UNAVAILABLE_MESSAGE } from './exportImage'

// The worker-load/start failure (stale chunk after a redeploy / blocked by CSP) must be distinguishable
// from a genuine compute/render failure, so the UI can show the reload hint for the former and keep the
// developer debug log for the latter.
describe('export failure classification', () => {
  it('flags a worker-unavailable failure and carries the actionable reload message', () => {
    const e = new ExportFailure(WORKER_UNAVAILABLE_MESSAGE, { path: 'worker', workerUnavailable: true })
    expect(isWorkerUnavailable(e)).toBe(true)
    expect(e.message).toContain('reload')
    expect(e.workerUnavailable).toBe(true)
  })

  it('does NOT flag a staged compute/render failure (it should still get a debug log)', () => {
    const e = new ExportFailure('boom', { path: 'worker', stage: 'run', causeName: 'RangeError' })
    expect(isWorkerUnavailable(e)).toBe(false)
    // a main-thread failure with a stage is likewise a real bug, not a reload case
    expect(isWorkerUnavailable(new ExportFailure('x', { path: 'main-thread', stage: 'render' }))).toBe(false)
  })

  it('is false for a plain error and for an abort', () => {
    expect(isWorkerUnavailable(new Error('nope'))).toBe(false)
    expect(isWorkerUnavailable('nope')).toBe(false)
    const abort = new ExportFailure('aborted', { path: 'worker' })
    expect(isWorkerUnavailable(abort)).toBe(false)
    // sanity: the abort predicate stays independent
    expect(isAbortError(new ExportFailure(WORKER_UNAVAILABLE_MESSAGE, { path: 'worker', workerUnavailable: true }))).toBe(false)
  })
})
