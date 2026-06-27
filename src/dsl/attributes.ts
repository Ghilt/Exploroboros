// The attribute registry: the single source of truth for what each DSL keyword means. The parser
// uses it to validate names (and whether they take an index / require a default); the evaluator uses
// it to compute a tile's value. Adding an attribute is one AttrName union member + one row here.

import type { Tiling, TileNode } from '../tiling'
import { neighborEdges, tileRotationDeg, uniqueNeighbors } from '../tiling'
import type { TileState } from '../canvas'
import { tileState, visitCount } from '../canvas'
import type { AttrName, AttrScope } from './types'

// Everything an attribute needs to compute its value for one tile. A future `neighbor`/`traverser`
// scope would add optional fields here without touching the AST.
export type EvalContext = {
  node: TileNode
  tiling: Tiling
  overlay: ReadonlyMap<string, TileState>
  indexById: ReadonlyMap<string, number>
}

export type AttrSpec = {
  name: AttrName
  // A human label for menus/chips (the visual editor). The DSL keyword stays the canonical name.
  label: string
  indexed: boolean // takes `[n]` (coordinate, step)
  needsDefault: boolean // may have no value for a tile -> the user must supply `default N`
  scopes: ReadonlyArray<AttrScope>
  // The tile's value, or undefined when it has none (out-of-range index, never visited) — the
  // evaluator then substitutes the AttrRef's `default`.
  compute: (ctx: EvalContext, index?: number) => number | undefined
}

const visits = (ctx: EvalContext): ReadonlyArray<number> => tileState(ctx.overlay, ctx.node.id).visits
const isVisited = (ctx: EvalContext, id: string): boolean => visitCount(tileState(ctx.overlay, id)) > 0

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
    // Visited neighbour EDGES — a two-edge neighbour counts twice (the prototype's adjacent-visited).
    name: 'adjacent-visited',
    label: 'adjacent-visited-count',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => neighborEdges(ctx.tiling, ctx.node.id).filter((e) => isVisited(ctx, e.tile)).length,
  },
  {
    // Distinct visited neighbour TILES (a two-edge neighbour counts once) — the usual Rule-90 count.
    name: 'adjacent-visited-unique',
    label: 'adjacent-tiles-visited-count',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => uniqueNeighbors(ctx.tiling, ctx.node.id).filter((id) => isVisited(ctx, id)).length,
  },
  {
    name: 'registry-a',
    label: 'Registry A',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => tileState(ctx.overlay, ctx.node.id).a,
  },
  {
    name: 'registry-b',
    label: 'Registry B',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
    compute: (ctx) => tileState(ctx.overlay, ctx.node.id).b,
  },
  {
    name: 'registry-c',
    label: 'Registry C',
    indexed: false,
    needsDefault: false,
    scopes: ['tile'],
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
]

const BY_NAME = new Map(ATTRIBUTES.map((a) => [a.name, a]))

export function attrSpec(name: string): AttrSpec | undefined {
  return BY_NAME.get(name as AttrName)
}
