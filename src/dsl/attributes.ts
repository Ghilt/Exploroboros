// The attribute registry: the single source of truth for what each DSL keyword means. The parser
// uses it to validate names (and whether they take an index / require a default); the evaluator uses
// it to compute a tile's value. Adding an attribute is one AttrName union member + one row here.

import type { Tiling, TileNode } from '../tiling'
import { neighborEdges, tileOrientation, tileRotationDeg, uniqueNeighbors } from '../tiling'
import type { TileState } from '../canvas'
import { tileState, visitCount } from '../canvas'
import type { AttrName, AttrScope } from './types'

// A walker's own state, exposed to the traverser DSL's formulas/guards. `heading` is the edge NUMBER
// the walker's `straight` move exits (0 = the north edge, increasing clockwise) — the same numbering
// as `edge k`. Present only while a traverser is being evaluated.
export type TraverserAttrs = {
  steps: number
  splits: number
  heading: number
  p: number
  q: number
  r: number
}

// Everything an attribute needs to compute its value for one tile. `traverser` is set only by the
// traverser DSL (undefined in the coloring/predicate path); its attributes then read as 0 there.
export type EvalContext = {
  node: TileNode
  tiling: Tiling
  overlay: ReadonlyMap<string, TileState>
  indexById: ReadonlyMap<string, number>
  traverser?: TraverserAttrs
}

export type AttrSpec = {
  name: AttrName
  // A human label for menus/chips (the visual editor). Now kept identical to the keyword so what you
  // see is what you type — the old short labels were a confusing third name.
  label: string
  indexed: boolean // takes `[n]` (coordinate, step)
  needsDefault: boolean // may have no value for a tile -> the user must supply `default N`
  scopes: ReadonlyArray<AttrScope>
  // An older keyword kept working for back-compat but hidden from the menus (so each concept shows
  // one canonical name). The parser/evaluator still resolve it.
  alias?: boolean
  // Valid only as a colour-ramp driver (a dropdown), NOT as typed predicate/formula text — the
  // parser rejects the bare name and points at the replacement. Used by the registries, which read
  // as `[A]` in the DSL but still drive ramps by name.
  rampOnly?: boolean
  // The tile's value, or undefined when it has none (out-of-range index, never visited) — the
  // evaluator then substitutes the AttrRef's `default`.
  compute: (ctx: EvalContext, index?: number) => number | undefined
}

const visits = (ctx: EvalContext): ReadonlyArray<number> => tileState(ctx.overlay, ctx.node.id).visits
const isVisited = (ctx: EvalContext, id: string): boolean => visitCount(tileState(ctx.overlay, id)) > 0
// Distinct visited neighbour TILES (a two-edge neighbour counts once) — the usual Rule-90 count.
const visitedNeighbors = (ctx: EvalContext) =>
  uniqueNeighbors(ctx.tiling, ctx.node.id).filter((id) => isVisited(ctx, id)).length
// Visited adjacent EDGES — a two-edge neighbour counts twice.
const visitedEdges = (ctx: EvalContext) =>
  neighborEdges(ctx.tiling, ctx.node.id).filter((e) => isVisited(ctx, e.tile)).length

export const ATTRIBUTES: ReadonlyArray<AttrSpec> = [
  {
    name: 'visited',
    label: 'visited',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => visitCount(tileState(ctx.overlay, ctx.node.id)),
  },
  {
    name: 'visited-neighbors',
    label: 'visited-neighbors',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: visitedNeighbors,
  },
  {
    name: 'visited-edges',
    label: 'visited-edges',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: visitedEdges,
  },
  // Back-compat aliases for the older keywords — hidden from the menus.
  {
    name: 'adjacent-visited-unique',
    label: 'visited-neighbors',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    alias: true,
    compute: visitedNeighbors,
  },
  {
    name: 'adjacent-visited',
    label: 'visited-edges',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    alias: true,
    compute: visitedEdges,
  },
  // Registries read as [A]/[B]/[C] in the DSL (rampOnly: the bare names below survive only as
  // colour-ramp drivers, and the parser rejects them in predicate/formula text).
  {
    name: 'registry-a',
    label: 'Registry A',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    rampOnly: true,
    compute: (ctx) => tileState(ctx.overlay, ctx.node.id).a,
  },
  {
    name: 'registry-b',
    label: 'Registry B',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    rampOnly: true,
    compute: (ctx) => tileState(ctx.overlay, ctx.node.id).b,
  },
  {
    name: 'registry-c',
    label: 'Registry C',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    rampOnly: true,
    compute: (ctx) => tileState(ctx.overlay, ctx.node.id).c,
  },
  {
    name: 'edge-count',
    label: 'edge count',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => ctx.node.sides.length,
  },
  {
    name: 'tile-number',
    label: 'tile number',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => ctx.indexById.get(ctx.node.id),
  },
  {
    name: 'rotation',
    label: 'rotation',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => tileRotationDeg(ctx.node.vertices, ctx.node.centroid),
  },
  {
    // Tiling-agnostic rotational-variant index (wedges 0..3, up/down triangles 0/1, …) — the portable
    // way to route by orientation without the tiling-specific `coordinate[slot]`. See src/tiling/orientation.ts.
    name: 'orientation',
    label: 'orientation',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => tileOrientation(ctx.tiling, ctx.node.id),
  },
  {
    name: 'coordinate',
    label: 'coordinate',
    indexed: true,
    needsDefault: true, // lattice length varies per tiling; an out-of-range coord has no value
    scopes: ['tile'],
    compute: (ctx, index) => ctx.node.lattice[index ?? 0],
  },
  {
    name: 'first-step',
    label: 'first step',
    indexed: false,
    needsDefault: true,
    scopes: ['tile'],
    compute: (ctx) => {
      const v = visits(ctx)
      return v.length ? v[0] : undefined
    },
  },
  {
    name: 'latest-step',
    label: 'latest step',
    indexed: false,
    needsDefault: true,
    scopes: ['tile'],
    compute: (ctx) => {
      const v = visits(ctx)
      return v.length ? v[v.length - 1] : undefined
    },
  },
  {
    name: 'step',
    label: 'step',
    indexed: true,
    needsDefault: true,
    scopes: ['tile'],
    compute: (ctx, index) => {
      const v = visits(ctx)
      const i = index ?? 0
      return i >= 0 && i < v.length ? v[i] : undefined
    },
  },
  // ---- traverser attributes (the walker's own state; see TraverserAttrs) ----
  {
    name: 'steps',
    label: 'steps',
    indexed: false,
    needsDefault: false,
    scopes: ['traverser'],
    compute: (ctx) => ctx.traverser?.steps,
  },
  {
    name: 'splits',
    label: 'splits',
    indexed: false,
    needsDefault: false,
    scopes: ['traverser'],
    compute: (ctx) => ctx.traverser?.splits,
  },
  {
    name: 'heading',
    label: 'heading',
    indexed: false,
    needsDefault: false,
    scopes: ['traverser'],
    compute: (ctx) => ctx.traverser?.heading,
  },
  {
    name: 'P',
    label: 'P',
    indexed: false,
    needsDefault: false,
    scopes: ['traverser'],
    compute: (ctx) => ctx.traverser?.p,
  },
  {
    name: 'Q',
    label: 'Q',
    indexed: false,
    needsDefault: false,
    scopes: ['traverser'],
    compute: (ctx) => ctx.traverser?.q,
  },
  {
    name: 'R',
    label: 'R',
    indexed: false,
    needsDefault: false,
    scopes: ['traverser'],
    compute: (ctx) => ctx.traverser?.r,
  },
]

// Attributes the predicate / visual editor menus offer: tile scope, excluding back-compat aliases
// and the rampOnly registries (those read as [A] in the DSL, not by name).
export const TILE_ATTRIBUTES: ReadonlyArray<AttrSpec> = ATTRIBUTES.filter(
  (a) => a.scopes.includes('tile') && !a.alias && !a.rampOnly,
)

// Attributes a colour ramp can be driven by (a dropdown): tile scope minus aliases — this DOES
// include the registries, so you can still colour by registry A/B/C.
export const RAMP_ATTRIBUTES: ReadonlyArray<AttrSpec> = ATTRIBUTES.filter(
  (a) => a.scopes.includes('tile') && !a.alias,
)

const BY_NAME = new Map(ATTRIBUTES.map((a) => [a.name, a]))

export function attrSpec(name: string): AttrSpec | undefined {
  return BY_NAME.get(name as AttrName)
}
