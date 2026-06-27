// The traverse engine's data model. Pure & isomorphic (no React/DOM/Konva) like src/tiling and
// src/dsl, so the same tick can run server-side later. A traverser is an agent walking the tiling
// graph; per-run mutable state (the visit log) lives in the overlay, keyed by tile id — never on
// the immutable Tiling (CLAUDE.md §4.3).

import type { Tiling } from '../tiling'
import type { TileState } from '../canvas'

// One walker: where it sits and which way it faces. `heading` is an absolute direction in radians,
// world y-up — the SAME convention as a side's outward `normalAngle` — so it compares directly to
// the tile's edge directions and the renderer can turn it into an arrow.
export type Traverser = {
  id: string
  tile: string
  heading: number
}

// Everything a tick reads. The overlay is frozen for the whole tick (read all, then write all), so
// no walker sees another's move within the same tick.
export type TraverseState = {
  tiling: Tiling
  overlay: ReadonlyMap<string, TileState>
  traversers: ReadonlyArray<Traverser>
  step: number
}

// The next state a tick produces.
export type TickResult = {
  overlay: Map<string, TileState>
  traversers: Traverser[]
  step: number
}
