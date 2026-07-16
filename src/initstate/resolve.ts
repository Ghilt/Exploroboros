// Resolve an Initial-state Doc into the fractal's STARTING state — seed walkers + tile registry/visited
// writes — against WHATEVER tiling is passed (the small preview grid OR the big export grid), so a rule
// scales with the grid. Pure & isomorphic. Guard predicates run at seed time (before any walk, so there
// is no walker): they read the CURRENT tile's attributes (tile-type / orientation / coordinate /
// hand-painted visited); walker-relative `.`-paths have nothing to resolve and fall back to defaults.

import type { Tiling, TileNode } from '../tiling'
import type { TileState } from '../canvas'
import { applyRegistryWrites, setVisits } from '../canvas'
import { evalPredicate, type EvalContext } from '../dsl'
import { DEFAULT_SETTINGS, type Program, type Traverser } from '../traverse'
import { blobTiles, lineTiles } from './geometry'
import type { Doc, Guard, Shape } from './types'

// A registry/visited SET-write onto one tile — kept separate from the seed walkers so the caller can
// apply them over any base overlay (the live board, or the export's remapped hand-paint).
export type InitWrite =
  | { tile: string; kind: 'reg'; reg: 'a' | 'b' | 'c'; value: number }
  | { tile: string; kind: 'visited'; count: number }

export type InitResolved = { seeds: Traverser[]; writes: InitWrite[]; unknownRefs: string[] }

// `accept` (only meaningful for a blob) makes the blob snap its anchor to the nearest tile that passes
// the guard, so a guarded blob does its best to land on a matching tile near the point rather than
// giving up when the exact nearest tile doesn't match. A line already spans many tiles, so it just
// picks the ones it crosses and lets the caller's guard filter them.
function shapeTiles(tiling: Tiling, shape: Shape, accept?: (node: TileNode) => boolean) {
  return shape.kind === 'line'
    ? lineTiles(tiling, shape.angle, shape.percent)
    : blobTiles(tiling, shape.x, shape.y, shape.radius, accept)
}

// After compile every guard is inline (named refs resolved); a lingering 'named' guard means the
// predicate map lacked it — treat as no match.
function guardPasses(guard: Guard | undefined, ctx: EvalContext): boolean {
  if (!guard) return true
  return guard.pred.kind === 'inline' ? evalPredicate(guard.pred.pred, ctx) : false
}

// Resolve a `t1`/`t2`/… number (1-based Traversers-pane order) or a bare name to a definition name, or
// null when it names no traverser.
function resolveRef(ref: string, order: ReadonlyArray<string>, defs: ReadonlyMap<string, Program>): string | null {
  const m = /^t([0-9]+)$/.exec(ref)
  if (m) {
    const idx = Number(m[1]) - 1
    return idx >= 0 && idx < order.length ? order[idx] : null
  }
  return defs.has(ref) ? ref : null
}

// `order` = user traverser NAMES in list order (for `tN`); `defs` = compiled Programs (for settings);
// `base` = the hand-paint overlay (so a `visited`-based guard reads the same board the export does);
// `indexById` backs `tile-number`. One walker per tile — the FIRST traverser placement to claim a tile
// wins. Unknown traverser refs are collected (for a pane warning) and skipped.
export function resolveInitialState(
  doc: Doc,
  tiling: Tiling,
  order: ReadonlyArray<string>,
  defs: ReadonlyMap<string, Program>,
  base: ReadonlyMap<string, TileState>,
  indexById: ReadonlyMap<string, number>,
): InitResolved {
  const seeds: Traverser[] = []
  const writes: InitWrite[] = []
  const seededTiles = new Set<string>()
  const unknownRefs = new Set<string>()
  for (const stmt of doc) {
    // A guarded blob anchors on the nearest tile that passes the guard (does its best to place one);
    // the per-tile guard below still filters the rest of the set (and a line's whole swath).
    const guard = stmt.guard
    const accept = guard
      ? (node: TileNode) => guardPasses(guard, { node, tiling, overlay: base, indexById })
      : undefined
    const tiles = shapeTiles(tiling, stmt.shape, accept)
    if (stmt.what.kind === 'traverser') {
      const name = resolveRef(stmt.what.ref, order, defs)
      if (name === null) {
        unknownRefs.add(stmt.what.ref)
        continue
      }
      const settings = defs.get(name)?.settings ?? DEFAULT_SETTINGS
      for (const node of tiles) {
        if (seededTiles.has(node.id)) continue
        const ctx: EvalContext = { node, tiling, overlay: base, indexById }
        if (!guardPasses(stmt.guard, ctx)) continue
        seededTiles.add(node.id)
        const sides = node.sides.length
        const heading = sides > 0 ? (((Math.round(stmt.param) % sides) + sides) % sides) : 0
        seeds.push({
          id: `init:${name}:${node.id}`,
          tile: node.id,
          heading,
          def: name,
          steps: 0,
          splits: 0,
          maxSplit: settings.maxSplit,
          maxSteps: settings.maxSteps,
          movement: settings.movement,
          p: 0,
          q: 0,
          r: 0,
        })
      }
      continue
    }
    // registry / visited set-writes (independent of walker placement — a tile may carry both)
    for (const node of tiles) {
      const ctx: EvalContext = { node, tiling, overlay: base, indexById }
      if (!guardPasses(stmt.guard, ctx)) continue
      if (stmt.what.kind === 'reg') {
        writes.push({ tile: node.id, kind: 'reg', reg: stmt.what.reg, value: stmt.param })
      } else {
        writes.push({ tile: node.id, kind: 'visited', count: Math.max(1, Math.round(stmt.param)) })
      }
    }
  }
  return { seeds, writes, unknownRefs: [...unknownRefs] }
}

// Merge two seed lists, one walker per tile — `primary` wins over `secondary` on a shared tile
// (hand-placed seeds win over init-placed ones). Stable order (all of `primary`, then `secondary`'s
// non-conflicting).
export function mergeByTile(primary: ReadonlyArray<Traverser>, secondary: ReadonlyArray<Traverser>): Traverser[] {
  const taken = new Set(primary.map((t) => t.tile))
  return [...primary, ...secondary.filter((t) => !taken.has(t.tile))]
}

// Apply init registry/visited SET-writes over a base overlay (hand-paint). Registries go through
// applyRegistryWrites with op 'set'; visited through setVisits (replaces the visit log). Both overwrite
// any hand-paint on that tile — init "set" wins — and apply in document order (last set wins per
// tile+field). Returns a fresh Map so it drops straight into React state.
export function applyInitWrites(
  base: ReadonlyMap<string, TileState>,
  writes: ReadonlyArray<InitWrite>,
): Map<string, TileState> {
  const regWrites = writes
    .filter((w): w is Extract<InitWrite, { kind: 'reg' }> => w.kind === 'reg')
    .map((w) => ({ tile: w.tile, reg: w.reg, op: 'set' as const, value: w.value }))
  let overlay = applyRegistryWrites(base, regWrites)
  for (const w of writes) if (w.kind === 'visited') overlay = setVisits(overlay, w.tile, w.count)
  return overlay
}
