import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import { compileProgram } from './index'
import { buildTraverseLog } from './traceLog'
import type { Traverser } from './types'

function setup() {
  const tiling = buildTiling('square', 8)
  const prog = compileProgram('move nearest-unvisited', new Map())
  if (!prog.ok) throw new Error('walker failed to compile')
  const defs = new Map([['Walker', prog.value]])
  const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i]))
  const start = tiling.nodes[Math.floor(tiling.nodes.length / 2)]
  const seed: Traverser = { id: 's', tile: start.id, heading: 0, def: 'Walker', steps: 0, splits: 0, maxSplit: 1, maxSteps: 100000, movement: 'relative', p: 0, q: 0, r: 0 }
  return { tiling, defs, indexById, seed, start }
}

describe('buildTraverseLog', () => {
  it('captures programs, geometry, per-tick summary, traces, and final state', () => {
    const { tiling, defs, indexById, seed, start } = setup()
    const log = buildTraverseLog({
      tiling,
      defs,
      indexById,
      startSeeds: [seed],
      baseOverlay: new Map(),
      meta: { tilingId: 'square', gridW: 8, gridH: 8, programs: { Walker: 'move nearest-unvisited' }, initialStateText: '', createdAt: '2026-07-06T00:00:00.000Z', appVersion: '0.1.0' },
      maxTicks: 200,
      maxTracedTicks: 5,
    })
    expect(log.kind).toBe('exploroboros-traverse-log')
    expect(log.programs.Walker).toBe('move nearest-unvisited')
    expect(Object.keys(log.tiles).length).toBe(tiling.nodes.length) // full geometry dictionary
    expect(log.tiles[start.id]).toMatchObject({ shape: start.shape })
    expect(log.seeds[0].tile).toBe(start.id)
    expect(log.summary.length).toBeGreaterThan(0)
    for (let i = 1; i < log.summary.length; i += 1) {
      expect(log.summary[i].totalVisited).toBeGreaterThanOrEqual(log.summary[i - 1].totalVisited) // non-decreasing
    }
    expect(log.final.visitedCount).toBe(log.final.visited.length)
    expect(log.final.visited.some((v) => v.tile === start.id)).toBe(true) // the start was visited at step 0
    expect(log.ticks.length).toBeLessThanOrEqual(5) // traces capped
    expect(log.config.tracedTicks).toBe(log.ticks.length)
    expect(log.ticks[0].traversers.length).toBeGreaterThan(0)
    expect(log.final.hitCap).toBe(false) // a nearest-unvisited walker traps on a finite grid
  })

  it('marks tracedTruncated when the run outlasts the trace cap', () => {
    const { tiling, defs, indexById, seed } = setup()
    const log = buildTraverseLog({
      tiling,
      defs,
      indexById,
      startSeeds: [seed],
      baseOverlay: new Map(),
      meta: { tilingId: 'square', gridW: 8, gridH: 8, programs: {}, initialStateText: '', createdAt: 'x', appVersion: '0.1.0' },
      maxTracedTicks: 1,
    })
    expect(log.ticks.length).toBe(1)
    expect(log.config.tracedTruncated).toBe(true)
    expect(log.summary.length).toBeGreaterThan(1) // the summary still covers the whole run
  })

  it('handles an empty seed set without throwing', () => {
    const { tiling, defs, indexById } = setup()
    const log = buildTraverseLog({
      tiling,
      defs,
      indexById,
      startSeeds: [],
      baseOverlay: new Map(),
      meta: { tilingId: 'square', gridW: 8, gridH: 8, programs: {}, initialStateText: '', createdAt: 'x', appVersion: '0.1.0' },
    })
    expect(log.summary.length).toBe(0)
    expect(log.final.visitedCount).toBe(0)
  })
})
