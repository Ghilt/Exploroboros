// Board tile NUMBERING schemes. A scheme orders the tiles; a tile's "number" is its position in that
// order (0-based, as the stats label + Inspect have always shown). Two schemes:
//   normal — generation order (tiling.nodes order), i.e. exactly the numbers shown before this existed.
//   spiral — concentric out from the tiling's centre: sorted by distance from the bounds centre, then a
//            clockwise-from-north angle (matching the app's edge-0=north convention), then id. Needs
//            only centroids, so it works on ANY tiling (square/hex/penrose/hat…); on a square grid it
//            reads as a centre-out clockwise spiral.
// The scheme drives the number drawn on tiles + the Inspect header, and is what `find-lowest-tile` /
// `find-highest-tile` search by (the lowest / highest number). Pure & isomorphic (no React/DOM);
// memoized per Tiling in a WeakMap like orientation.ts / graph.ts. Do NOT import from src/export — the
// bounds-centre math is inlined to keep the tiling engine dependency-free.

import type { Tiling } from './types'

export type NumberingScheme = 'normal' | 'spiral'

type Numbering = { order: ReadonlyArray<string>; pos: ReadonlyMap<string, number> }

const cache = new WeakMap<Tiling, Partial<Record<NumberingScheme, Numbering>>>()

function build(tiling: Tiling, scheme: NumberingScheme): Numbering {
  let order: string[]
  if (scheme === 'spiral') {
    const { minX, minY, maxX, maxY } = tiling.bounds
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    order = tiling.nodes
      .map((n) => {
        const dx = n.centroid.x - cx
        const dy = n.centroid.y - cy
        // Clockwise angle from north (0 = N, increasing clockwise), so the sweep matches the app's
        // edge-0=north convention. atan2(dx, dy) gives N=0, E=+pi/2, S=+/-pi, W=-pi/2; fold to [0,2pi).
        let ang = Math.atan2(dx, dy)
        if (ang < 0) ang += Math.PI * 2
        return { id: n.id, d2: dx * dx + dy * dy, ang }
      })
      // Distance rings out from the centre; within a ring by clockwise angle; id breaks exact ties so
      // the order is fully deterministic (reproducible in export).
      .sort((a, b) => a.d2 - b.d2 || a.ang - b.ang || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((e) => e.id)
  } else {
    order = tiling.nodes.map((n) => n.id)
  }
  const pos = new Map<string, number>()
  order.forEach((id, i) => pos.set(id, i))
  return { order, pos }
}

function numbering(tiling: Tiling, scheme: NumberingScheme): Numbering {
  let byScheme = cache.get(tiling)
  if (!byScheme) cache.set(tiling, (byScheme = {}))
  return byScheme[scheme] ?? (byScheme[scheme] = build(tiling, scheme))
}

// Tile ids in ascending "number" order under the scheme (index 0 = the lowest-numbered tile).
export function numberingOrder(tiling: Tiling, scheme: NumberingScheme): ReadonlyArray<string> {
  return numbering(tiling, scheme).order
}

// A tile's number under the scheme = its position in the order (0-based). Unknown id -> -1 (matches
// the existing `?? -1` fallback at the display call sites).
export function numberOf(tiling: Tiling, scheme: NumberingScheme, id: string): number {
  return numbering(tiling, scheme).pos.get(id) ?? -1
}

// The search bundle the traverse engine's find-lowest/highest-tile runs over: the order array plus an
// O(1) position lookup (both memoized). Shape-compatible with src/traverse's `Numbering` (structural).
export function numberingFor(tiling: Tiling, scheme: NumberingScheme): { order: ReadonlyArray<string>; posOf: (id: string) => number } {
  const n = numbering(tiling, scheme)
  return { order: n.order, posOf: (id) => n.pos.get(id) ?? -1 }
}
