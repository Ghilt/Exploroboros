// Resolve one scanned PathOccurrence into the ORDERED tile ids it walks through — the start tile, every
// intermediate hop, and the final tile — so the path-preview feature can draw a line through their centres
// and outline the last one. Pure & isomorphic (no React/DOM/Konva). Empty when the path can't be resolved
// statically (a `target` base, an out-of-range `.tile N`, a missing start tile, or an `fN` that hasn't been
// found — see `found`).

import type { Tiling } from '../../tiling'
import { nodeById } from '../../tiling'
import type { TileState } from '../../canvas'
import type { Movement, Program } from './types'
import { walkChain, type Hop } from './edges'
import { runProgram, type WalkerState } from './exec'
import type { Numbering } from './findLowest'
import type { PathOccurrence } from './scanPaths'

// Run the walker's program for ONE tick and return its find-tile / find-lowest/highest results (the `fN`
// tiles), exactly as the engine computes them — so the path preview can resolve `move f0`, `visited.f1.e0`,
// etc. The tick's moves/writes are discarded; only `found` is read. A find gated off by a false guard this
// tick stays unresolved (matches what the running engine would do). One tick of one walker, so cheap.
export function computeFound(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  walker: WalkerState,
  program: Program,
  order: ReadonlyArray<string>, // number -> id (the numbering scheme's order), for .tile N / find-extreme
  indexById: ReadonlyMap<string, number>,
  numbering?: Numbering,
  step?: number,
): ReadonlyArray<Hop> {
  return runProgram({ tiling, overlay, indexById, tileByIndex: order, walker, program, numbering, step }).found
}

export function resolveWalk(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  startTile: string,
  startHeading: number, // edge number
  movement: Movement,
  occurrence: PathOccurrence,
  order?: ReadonlyArray<string>, // .tile N resolution; absent -> generation order (tiling.nodes)
  found?: ReadonlyArray<Hop>, // fN results (from computeFound); absent -> `fN` bases don't resolve
): string[] {
  const base = occurrence.base
  // No static answer in the editor: a move destination (`.target`).
  if (base.kind === 'target') return []
  // `fN`: start at the tile the find-tile / find-lowest search located this tick, then walk any hops.
  if (base.kind === 'found') {
    const hop = found?.[base.index]
    if (!hop) return [] // not found / not run / no found array supplied
    return walkChain(tiling, overlay, hop.tile, hop.heading, movement, occurrence.refs)
  }
  if (base.kind === 'tile') {
    const id = order ? order[base.index] : tiling.nodes[base.index]?.id
    if (!id || !nodeById(tiling, id)) return []
    // `.tile N` is a base; trailing hops chain from it. Absolute `eN` hops ignore the heading, but a
    // relative hop (`.tile 5.r1`) uses the WALKER'S current heading — matching exec.ts:resolvePathFrom.
    return walkChain(tiling, overlay, id, startHeading, movement, occurrence.refs)
  }
  if (!nodeById(tiling, startTile)) return []
  return walkChain(tiling, overlay, startTile, startHeading, movement, occurrence.refs)
}
