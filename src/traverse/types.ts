// The traverse engine's data model. Pure & isomorphic (no React/DOM/Konva) like src/tiling and
// src/dsl, so the same tick can run server-side later. A traverser is an agent walking the tiling
// graph; per-run mutable state (the visit log) lives in the overlay, keyed by tile id — never on
// the immutable Tiling (CLAUDE.md §4.3).

import type { Tiling } from '../tiling'
import type { TileState } from '../canvas'
import type { Movement, Program } from './lang'

// One walker. `heading` is an absolute direction in radians, world y-up — the SAME convention as a
// side's outward `normalAngle` — so it compares directly to the tile's edge directions and the
// renderer can turn it into an arrow. `def` is the definition NAME it runs (also the morph target
// key). The rest is per-walker mutable state the DSL reads/changes: tick count, split count, the
// effective settings (initialised from the def, mutable via `update`), and its own registers P/Q/R.
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
// program; `indexById` gives `tile-number` and `@ tile N`.
export type TraverseState = {
  tiling: Tiling
  overlay: ReadonlyMap<string, TileState>
  traversers: ReadonlyArray<Traverser>
  step: number
  defs: ReadonlyMap<string, Program>
  indexById: ReadonlyMap<string, number>
}

// The next state a tick produces.
export type TickResult = {
  overlay: Map<string, TileState>
  traversers: Traverser[]
  step: number
}
