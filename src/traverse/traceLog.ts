// Build a rich, downloadable log of a whole traverse run — the analysis artifact for debugging a
// pattern (why it grows the way it does, where symmetry breaks, why a walker didn't move). Pure &
// isomorphic (no React/DOM): it re-runs the current setup from the authored seeds to completion with
// tracing on (stepTraversersTraced), mirroring initRun, so the log reproduces exactly what Play grows.
//
// The log is self-contained for offline analysis: the program texts, a geometry dictionary (every
// tile's id → shape + centroid, so ids can be mapped to positions), per-tick decision traces (each
// walker's statements + every candidate move and why it was chosen/rejected — the TickTrace), a
// per-tick summary for the WHOLE run, and the final visited/registry state. Full traces are capped
// (a branching run explodes) but the summary + final state always cover the entire run.

import type { Tiling } from '../tiling'
import { addVisits, type TileState } from '../canvas'
import { stepTraversersTraced } from './step'
import { DEFAULT_SETTINGS, type Program } from './lang'
import type { Traverser } from './types'
import type { TickTrace } from './trace'

export const TRAVERSE_LOG_VERSION = 1

export type TraverseLogMeta = {
  tilingId: string
  gridW: number
  gridH: number
  programs: Record<string, string> // definition name -> DSL source (built-in Walker + each traverser)
  initialStateText: string
  createdAt: string
  appVersion: string
}

export type TraverseLog = {
  kind: 'exploroboros-traverse-log'
  version: number
  createdAt: string
  appVersion: string
  tilingId: string
  gridW: number
  gridH: number
  programs: Record<string, string>
  initialStateText: string
  config: { maxTicks: number; tracedTicks: number; tracedTruncated: boolean }
  seeds: Array<{ id: string; tile: string; shape: string; heading: number; def: string; x: number; y: number }>
  // Geometry dictionary: tile id -> { shape, x, y } for EVERY tile, so an analyzer can map any id in a
  // trace to a position (e.g. to check the visited set for mirror/rotation symmetry).
  tiles: Record<string, { shape: string; x: number; y: number }>
  summary: Array<{ step: number; walkers: number; newVisits: number; totalVisited: number }>
  ticks: TickTrace[] // full per-tick decision traces, capped at config.tracedTicks
  final: { step: number; hitCap: boolean; visitedCount: number; visited: Array<{ tile: string; visits: number[]; a: number; b: number; c: number }> }
}

const round = (n: number) => Math.round(n * 1000) / 1000

function countVisited(overlay: ReadonlyMap<string, TileState>): number {
  let n = 0
  for (const st of overlay.values()) if (st.visits.length > 0) n += 1
  return n
}

export function buildTraverseLog(input: {
  tiling: Tiling
  defs: ReadonlyMap<string, Program>
  indexById: ReadonlyMap<string, number>
  startSeeds: ReadonlyArray<Traverser> // authored + Initial-state seeds, already merged (hand wins)
  baseOverlay: ReadonlyMap<string, TileState> // authored board + Initial-state set-writes (no step-0 visits yet)
  meta: TraverseLogMeta
  maxTicks?: number
  maxTracedTicks?: number
}): TraverseLog {
  const { tiling, defs, indexById, startSeeds, baseOverlay, meta } = input
  const maxTicks = input.maxTicks ?? 400
  const maxTracedTicks = input.maxTracedTicks ?? 30

  // Mirror initRun: refresh each seed's settings/registers from its definition, then stamp step-0 visits.
  const live: Traverser[] = startSeeds.map((s) => {
    const set = defs.get(s.def)?.settings ?? DEFAULT_SETTINGS
    return { ...s, steps: 0, splits: 0, p: 0, q: 0, r: 0, maxSplit: set.maxSplit, maxSteps: set.maxSteps, movement: set.movement }
  })
  let overlay: Map<string, TileState> = addVisits(baseOverlay, [...new Set(live.map((t) => t.tile))], 0) as Map<string, TileState>

  const byId = new Map(tiling.nodes.map((n) => [n.id, n]))
  const seeds = live.map((s) => {
    const n = byId.get(s.tile)
    return { id: s.id, tile: s.tile, shape: n?.shape ?? '?', heading: s.heading, def: s.def, x: round(n?.centroid.x ?? 0), y: round(n?.centroid.y ?? 0) }
  })
  const tiles: Record<string, { shape: string; x: number; y: number }> = {}
  for (const n of tiling.nodes) tiles[n.id] = { shape: n.shape, x: round(n.centroid.x), y: round(n.centroid.y) }

  const summary: TraverseLog['summary'] = []
  const ticks: TickTrace[] = []
  let walkers = live
  let step = 0
  let ran = 0
  let prevVisited = countVisited(overlay)
  let tracedTruncated = false
  while (walkers.length > 0 && ran < maxTicks) {
    const res = stepTraversersTraced({ tiling, overlay, traversers: walkers, step, defs, indexById })
    overlay = res.overlay as Map<string, TileState>
    walkers = res.traversers
    step = res.step
    ran += 1
    const totalVisited = countVisited(overlay)
    summary.push({ step: res.step, walkers: walkers.length, newVisits: totalVisited - prevVisited, totalVisited })
    prevVisited = totalVisited
    if (ticks.length < maxTracedTicks) ticks.push(res.trace)
    else tracedTruncated = true
  }

  const visited: TraverseLog['final']['visited'] = []
  for (const [tile, st] of overlay) if (st.visits.length > 0) visited.push({ tile, visits: [...st.visits], a: st.a, b: st.b, c: st.c })

  return {
    kind: 'exploroboros-traverse-log',
    version: TRAVERSE_LOG_VERSION,
    createdAt: meta.createdAt,
    appVersion: meta.appVersion,
    tilingId: meta.tilingId,
    gridW: meta.gridW,
    gridH: meta.gridH,
    programs: meta.programs,
    initialStateText: meta.initialStateText,
    config: { maxTicks, tracedTicks: ticks.length, tracedTruncated },
    seeds,
    tiles,
    summary,
    ticks,
    final: { step, hitCap: walkers.length > 0, visitedCount: visited.length, visited },
  }
}

export function serializeTraverseLog(log: TraverseLog): string {
  return JSON.stringify(log, null, 2)
}

export function traverseLogFilename(tilingId: string, createdAt: string): string {
  const safe = tilingId.replace(/[^a-z0-9-]+/gi, '-')
  const stamp = createdAt.replace(/[:.]/g, '-')
  return `exploroboros-traverse-log-${safe}-${stamp}.json`
}
