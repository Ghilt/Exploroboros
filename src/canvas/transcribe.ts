// Transcribe a canvas drag gesture (the ordered tiles the pointer crossed) into a traverser-DSL path
// string — the INVERSE of walkChain. When the start tile carries a walker a heading is passed and the
// path is written RELATIVE to it (`straight.r1.r1.l2`), threading the heading exactly as the engine
// re-aims on arrival so it round-trips; with no walker there's no heading and it's ABSOLUTE (`e0.e3.e3`).
// A gesture that crosses no edge (a single tile) yields the tile's TYPE (shape name) instead of a path.
//
// PURE (no DOM/Konva) and — deliberately — depends only on src/tiling: the straight-through partner and
// the edge-ref spellings below MIRROR src/traverse/lang (edges.ts `straightPartner`, serialize.ts
// `edgeRef`), rather than importing them, so src/canvas never gains a runtime edge back into src/traverse
// (edges.ts already imports src/canvas). The round-trip tests in transcribe.test.ts (which DO call the
// real walkChain) guard the two mirrors against drift.

import type { Tiling, TileNode } from '../tiling'
import { nodeById, opposite, edgeToLocalSide, localSideToEdge, sharedEdgeNumbers } from '../tiling'
import type { EdgeRef } from '../traverse/lang' // type-only — erased at build, so no canvas<->traverse cycle

export type TranscribeKind = 'path' | 'tile-type'
// `refs` is the produced move chain (empty for a tile-type result); exposed so a round-trip test — and the
// caller if useful — can feed it straight back into walkChain.
export type TranscribeResult = { text: string; kind: TranscribeKind; refs: EdgeRef[] }

const TWO_PI = Math.PI * 2
function angleGap(a: number, b: number): number {
  let d = Math.abs(a - b) % TWO_PI
  if (d > Math.PI) d = TWO_PI - d
  return d
}

// The edge `straight` exits when a walker ENTERED via `edge` — the straight-through partner. Mirrors
// src/traverse/lang/edges.ts `straightPartner`: the opposite edge on a normal tile, the shape's
// hand-crafted pairing on the wedge (both via `opposite`), the lower-numbered opposite on odd-sided tiles.
function straightThroughPartner(tiling: Tiling, node: TileNode, edge: number): number {
  const local = edgeToLocalSide(node, edge)
  const opp = opposite(tiling, node.id, local).map((l) => localSideToEdge(node, l))
  return opp.length === 1 ? opp[0] : Math.min(...opp)
}

// The edge NUMBER on `a` physically crossed to reach `b`. Normally the one shared edge; on a two-edge
// adjacency (octagon+wedge) pick the shared edge whose outward normal best points from a's centre toward
// b's — the edge the drag actually went through. null when the tiles aren't adjacent (a sampler gap).
function crossingEdge(tiling: Tiling, a: string, b: string): number | null {
  const shared = sharedEdgeNumbers(tiling, a, b)
  if (shared.length <= 1) return shared.length === 1 ? shared[0] : null
  const A = nodeById(tiling, a)
  const B = nodeById(tiling, b)
  if (!A || !B) return shared[0]
  const dir = Math.atan2(B.centroid.y - A.centroid.y, B.centroid.x - A.centroid.x)
  let best = shared[0]
  let bestGap = Infinity
  for (const e of shared) {
    const gap = angleGap(A.sides[edgeToLocalSide(A, e)].geometry.normalAngle, dir)
    if (gap < bestGap) {
      bestGap = gap
      best = e
    }
  }
  return best
}

// Edge NUMBER -> a relative EdgeRef, given the current heading and its straight-through partner. Priority
// straight > back > shortest turn (ties to the right), so `walkChain` re-derives the same edge and it
// round-trips. On a normal even-sided tile the partner IS the n/2 turn, so `back` wins there too (checked
// first, which matters on the wedge where the partner is NOT n/2).
function relativeRef(exit: number, heading: number, sides: number, partner: number): EdgeRef {
  if (exit === heading) return { kind: 'straight' }
  if (exit === partner) return { kind: 'back' }
  const d = (((exit - heading) % sides) + sides) % sides
  return d <= sides / 2 ? { kind: 'turn', dir: 'r', n: d } : { kind: 'turn', dir: 'l', n: sides - d }
}

// Mirror of src/traverse/lang/serialize.ts `edgeRef` (kept local to avoid a src/traverse runtime import).
function edgeRefText(r: EdgeRef): string {
  switch (r.kind) {
    case 'straight':
      return 'straight'
    case 'back':
      return 'back'
    case 'unvisited':
      return 'nearest-unvisited'
    case 'turn':
      return `${r.dir}${r.n}`
    case 'edge':
      return `e${r.index}`
  }
}

function dedupeConsecutive(ids: readonly string[]): string[] {
  const out: string[] = []
  for (const id of ids) if (out[out.length - 1] !== id) out.push(id)
  return out
}

// tileIds: the tiles the drag crossed, in order (consecutive duplicates are harmless — deduped here — so a
// back-and-forth A->B->A still reads as two hops). startHeading: the start tile's walker heading (an edge
// number) for a relative path, or null for an absolute one.
export function transcribeGesture(tiling: Tiling, tileIds: readonly string[], startHeading: number | null): TranscribeResult {
  const tiles = dedupeConsecutive(tileIds)
  const startShape = tiles.length ? nodeById(tiling, tiles[0])?.shape ?? '' : ''
  const asTileType = (): TranscribeResult => ({ text: startShape, kind: 'tile-type', refs: [] })
  if (tiles.length < 2) return asTileType()

  const refs: EdgeRef[] = []
  if (startHeading == null) {
    // Absolute: each hop is the edge NUMBER on the current tile leading to the next — heading-free.
    for (let i = 0; i < tiles.length - 1; i += 1) {
      const e = crossingEdge(tiling, tiles[i], tiles[i + 1])
      if (e == null) break // a non-adjacent jump ends the path early
      refs.push({ kind: 'edge', index: e })
    }
  } else {
    // Relative: thread the heading, re-aiming to the straight-through partner of each edge crossed.
    let h = startHeading
    for (let i = 0; i < tiles.length - 1; i += 1) {
      const from = nodeById(tiling, tiles[i])
      const to = nodeById(tiling, tiles[i + 1])
      if (!from || !to) break
      const exit = crossingEdge(tiling, tiles[i], tiles[i + 1])
      if (exit == null) break
      refs.push(relativeRef(exit, h, from.sides.length, straightThroughPartner(tiling, from, h)))
      const entry = crossingEdge(tiling, tiles[i + 1], tiles[i])
      if (entry == null) break
      h = straightThroughPartner(tiling, to, entry)
    }
  }
  if (refs.length === 0) return asTileType() // no edge crossed -> the tile's type
  return { text: refs.map(edgeRefText).join('.'), kind: 'path', refs }
}
