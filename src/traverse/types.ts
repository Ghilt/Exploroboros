// The traverse engine's data model. Pure & isomorphic (no React/DOM/Konva) like src/tiling and
// src/dsl, so the same tick can run server-side later. A traverser is an agent walking the tiling
// graph; per-run mutable state (the visit log) lives in the overlay, keyed by tile id — never on
// the immutable Tiling (CLAUDE.md §4.3).

import type { Tiling } from '../tiling'
import type { TileState } from '../canvas'
import type { FindLowestCache, Movement, Numbering, Program } from './lang'

// One walker. `heading` is the clockwise-from-top edge NUMBER its `straight` move exits (0 = the north
// edge, increasing clockwise, current-tile-relative) — so `r1` is heading+1, `l1` is heading-1, and the
// renderer points the arrow at that edge. On every move the heading is recomputed as the straight-
// through partner of the edge crossed into (see edges.ts). `def` is the definition NAME it runs (also
// the morph target key). The rest is per-walker mutable state the DSL reads/changes: tick count, split
// count, the effective settings (initialised from the def, mutable via `update`), and its registers P/Q/R.
export type Traverser = {
  id: string
  tile: string
  heading: number
  def: string
  steps: number
  splits: number
  maxSplit: number
  maxSteps: number
  movement: Movement
  p: number
  q: number
  r: number
}

// Everything a tick reads. The overlay is frozen for the whole tick (read all, then write all), so
// no walker sees another's move within the same tick. `defs` maps a definition name to its compiled
// program; `indexById` gives `tile-number` and `. tile N`.
export type TraverseState = {
  tiling: Tiling
  overlay: ReadonlyMap<string, TileState>
  traversers: ReadonlyArray<Traverser>
  step: number
  defs: ReadonlyMap<string, Program>
  indexById: ReadonlyMap<string, number>
  // The board numbering find-lowest/highest-tile searches by (absent = normal / generation order), and the
  // run-owned bookmark cache the search advances instead of rescanning each tick (absent = no caching, still
  // correct). The caller re-attaches the SAME cache object each tick so bookmarks survive across ticks.
  numbering?: Numbering
  findLowestCache?: FindLowestCache
}

// The next state a tick produces.
export type TickResult = {
  overlay: Map<string, TileState>
  traversers: Traverser[]
  step: number
}
