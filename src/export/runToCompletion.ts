// Run a traverse off-screen, to completion — the headless counterpart of the Workspace clock. Pure
// & isomorphic (no React/DOM/Konva), so it runs in a Web Worker or under Vitest. It loops the same
// tick the live run uses (via stepTraversersInto, the in-place variant that shares computeTick with
// the live stepTraversers), so an export reproduces exactly what Play would have grown — just without
// the animation, and without copying a growing overlay every tick (which would be O(ticks × visited)
// on a big export grid). The loop ends when every walker has died (the natural stop) or the `maxTicks`
// safety cap is hit (a pathological never-terminating custom program).

import type { Tiling } from '../tiling'
import { EMPTY_TILE_STATE, type TileState } from '../canvas'
import { stepTraversersInto, DEFAULT_SETTINGS, type Traverser, type Program } from '../traverse'

export type RunResult = {
  overlay: Map<string, TileState>
  ticks: number
  // True when the loop stopped on the cap rather than the walkers dying out — the caller should
  // surface this ("run did not terminate") instead of treating the image as complete.
  hitCap: boolean
}

// How often to report progress (in ticks) — the run length is unknown up front, so progress is a
// live tick/visit count, not a percentage.
const PROGRESS_EVERY = 500

export function runToCompletion(
  tiling: Tiling,
  seeds: ReadonlyArray<Traverser>,
  baseOverlay: ReadonlyMap<string, TileState>,
  defs: ReadonlyMap<string, Program>,
  indexById: ReadonlyMap<string, number>,
  maxTicks = 1_000_000,
  onProgress?: (ticks: number, liveCount: number) => void,
): RunResult {
  // One mutable working overlay, seeded from the hand-painted base. TileState values are never mutated
  // in place (always replaced), so the caller's baseOverlay is untouched.
  const overlay = new Map<string, TileState>(baseOverlay)

  // Mirror Workspace.play(): refresh each seed's settings/registers from its current definition, then
  // stamp every start tile visited at step 0.
  const live: Traverser[] = seeds.map((s) => {
    const set = defs.get(s.def)?.settings ?? DEFAULT_SETTINGS
    return { ...s, steps: 0, splits: 0, p: 0, q: 0, r: 0, maxSplit: set.maxSplit, maxSteps: set.maxSteps, movement: set.movement }
  })
  for (const id of new Set(live.map((t) => t.tile))) {
    const prev = overlay.get(id) ?? EMPTY_TILE_STATE
    overlay.set(id, { ...prev, visits: [...prev.visits, 0] })
  }

  let walkers: Traverser[] = live
  let step = 0
  let ticks = 0
  while (walkers.length > 0 && ticks < maxTicks) {
    const res = stepTraversersInto({ tiling, overlay, traversers: walkers, step, defs, indexById }, overlay)
    walkers = res.traversers
    step = res.step
    ticks += 1
    if (onProgress && ticks % PROGRESS_EVERY === 0) onProgress(ticks, walkers.length)
  }

  return { overlay, ticks, hitCap: walkers.length > 0 }
}
