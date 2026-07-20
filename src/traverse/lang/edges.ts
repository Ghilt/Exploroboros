// Resolving an EdgeRef to a concrete move, in EDGE-NUMBER space.
//
// A walker's `heading` is the clockwise-from-top edge NUMBER that `straight` exits — 0 = the north
// edge, increasing clockwise. Relative commands are then pure ring arithmetic on that number, and
// behave identically on EVERY tile, the concave wedge included:
//
//   straight -> heading        r{k} -> heading + k        l{k} -> heading - k     (mod side-count)
//   back     -> straightPartner(heading)   (the reverse of straight — the edge you'd have entered by)
//   edge k   -> k              (absolute — ignores the heading)
//   nearest-unvisited -> the unvisited neighbour reached by the least turn (smallest edge-number
//                        distance) from the heading
//
// In `absolute` movement the turns are measured from north (edge 0) instead of the heading.
//
// A hop returns the destination tile AND its NEW heading (an edge number ON THAT tile): on ARRIVAL the
// heading is recomputed as the straight-through partner of the edge just crossed — the opposite edge on
// a normal tile, the shape's hand-crafted pairing on the wedge (both via the shape's `oppositeSides`).
// That is the ONLY place the wedge pairing enters the system; rotating a placed walker in the editor is
// plain +1/-1 and never touches it. Because the pairing lives at arrival, there is no "is this the
// first step" special case: a placed walker simply exits the edge it is aimed at.

import type { Tiling, TileNode } from '../../tiling'
import { across, edgeToLocalSide, localSideToEdge, nodeById, opposite } from '../../tiling'
import { tileState, visitCount, type TileState } from '../../canvas'
import { amountValue, type Expr } from '../../dsl'
import type { EdgeRef, Movement } from './types'

// Where a single hop lands: the destination tile, and the new heading (an edge number on that tile),
// or null at a boundary / when the ref names no such edge.
export type Hop = { tile: string; heading: number } | null

// Resolve a computed edge/turn amount (`r(steps % 2)`, `e(orientation)`) to an integer, given the tile +
// heading the hop acts from. Supplied by whoever owns an EvalContext (exec.ts's walker run, the colorizer,
// the path preview); when omitted (pure literal resolution) an expression amount degrades to 0.
export type AmountEval = (expr: Expr, tile: string, heading: number) => number

// The concrete integer for a ref's `edge`/`turn` amount — a literal verbatim, an expression via evalAmount
// (rounded to nearest), 0 for the non-numeric kinds (straight/back/unvisited ignore it).
function amountFor(ref: EdgeRef, tile: string, heading: number, evalAmount?: AmountEval): number {
  const raw = ref.kind === 'turn' ? ref.n : ref.kind === 'edge' ? ref.index : 0
  return amountValue(raw, (e) => (evalAmount ? evalAmount(e, tile, heading) : 0))
}

// Distance around the edge ring in [0, floor(n/2)].
function ringDist(a: number, b: number, n: number): number {
  const d = (((a - b) % n) + n) % n
  return Math.min(d, n - d)
}

// The edge NUMBER that `straight` exits when a walker ENTERED via `entryEdge` — the straight-through
// partner. Normal tiles: the opposite edge. The wedge: its hand-crafted pairing (both come from the
// shape's `oppositeSides`, read via opposite()). Odd-sided tiles have two "opposite" edges (the spot
// opposite an edge is a vertex), so pick the lower-numbered one deterministically.
export function straightPartner(tiling: Tiling, node: TileNode, entryEdge: number): number {
  const local = edgeToLocalSide(node, entryEdge)
  const opp = opposite(tiling, node.id, local).map((l) => localSideToEdge(node, l))
  return opp.length === 1 ? opp[0] : Math.min(...opp)
}

// Step out a chosen local side: the neighbour, and the heading it arrives with (the straight-through
// partner of the edge crossed into). null at a boundary.
function stepLocal(tiling: Tiling, tile: string, localSide: number): Hop {
  const end = across(tiling, tile, localSide)
  if (!end) return null
  const nb = nodeById(tiling, end.tile)!
  return { tile: end.tile, heading: straightPartner(tiling, nb, localSideToEdge(nb, end.side)) }
}

// The unvisited neighbour reached by the least turn from `heading` (smallest edge-number distance);
// ties break to the lower edge number. null when every neighbour is visited (the walker is trapped).
function resolveUnvisited(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  tile: string,
  heading: number,
): Hop {
  const node = nodeById(tiling, tile)
  if (!node) return null
  const n = node.sides.length
  let bestLocal = -1
  let bestDist = Infinity
  for (let e = 0; e < n; e += 1) {
    const local = edgeToLocalSide(node, e)
    const end = across(tiling, tile, local)
    if (!end) continue // boundary edge
    if (visitCount(tileState(overlay, end.tile)) > 0) continue // already visited
    const dist = ringDist(e, heading, n)
    if (dist < bestDist) {
      bestDist = dist
      bestLocal = local
    }
  }
  return bestLocal < 0 ? null : stepLocal(tiling, tile, bestLocal)
}

// The edge NUMBER a fixed-edge ref resolves to on a tile with `sides` sides. straight/turn are relative to
// the heading; in ABSOLUTE movement they are relative to north (edge 0). `amount` is the pre-resolved
// integer for edge/turn (see amountFor). `unvisited` returns null (it needs the overlay and is handled
// separately).
function targetEdge(sides: number, heading: number, movement: Movement, ref: EdgeRef, amount: number): number | null {
  const base = movement === 'absolute' ? 0 : heading
  const wrap = (e: number) => ((e % sides) + sides) % sides
  switch (ref.kind) {
    case 'edge':
      return wrap(amount)
    case 'straight':
      return wrap(base)
    case 'turn':
      return wrap(base + (ref.dir === 'r' ? amount : -amount))
    case 'unvisited':
    case 'back':
      return null // both need the tiling/node (overlay, straight-through pairing) — handled in resolveRef
  }
}

export function resolveRef(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  tile: string,
  heading: number,
  movement: Movement,
  ref: EdgeRef,
  evalAmount?: AmountEval,
): Hop {
  if (ref.kind === 'unvisited') return resolveUnvisited(tiling, overlay, tile, heading)
  const node = nodeById(tiling, tile)
  if (!node) return null
  if (ref.kind === 'back') {
    // The reverse of straight: exit the straight-through PARTNER of the reference edge (heading, or
    // north in absolute movement) — the edge a walker would have entered by. Reuses the shape's arrival
    // pairing, so it crosses the concave wedge cleanly.
    const base = movement === 'absolute' ? 0 : heading
    return stepLocal(tiling, tile, edgeToLocalSide(node, straightPartner(tiling, node, base)))
  }
  const amount = amountFor(ref, tile, heading, evalAmount)
  const edge = targetEdge(node.sides.length, heading, movement, ref, amount)
  if (edge === null) return null
  return stepLocal(tiling, tile, edgeToLocalSide(node, edge))
}

// Follow a chain of refs from a starting tile/heading; only the FINAL tile is the destination (the
// intermediate tiles are passed through, not visited). Each hop re-aims along the edge it crossed, so
// a later ref in the chain turns relative to the freshly-updated heading. null if any hop hits a
// boundary / dead ref.
export function resolveChain(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  tile: string,
  heading: number,
  movement: Movement,
  chain: ReadonlyArray<EdgeRef>,
  evalAmount?: AmountEval,
): Hop {
  let cur: { tile: string; heading: number } = { tile, heading }
  for (const ref of chain) {
    // Amounts resolve per hop, against the tile+heading reached so far (so `orientation` in an amount reads
    // the current hop's tile, `steps`/`heading` the walker).
    const hop = resolveRef(tiling, overlay, cur.tile, cur.heading, movement, ref, evalAmount)
    if (!hop) return null
    cur = hop
  }
  return cur
}

// Like resolveChain, but returns the id of EVERY tile the chain passes through — the start tile, each
// intermediate hop, and the final destination — so a caller can draw the whole walk (a line through the
// tile centres), not just land on the end. A null hop (boundary / dead ref) TRUNCATES the walk to the
// tiles reached so far. Kept a SEPARATE sibling of resolveChain (which stays a single-Hop function on the
// per-tick hot path); this is the preview/debug variant. See src/traverse/lang/resolveWalk.ts.
export function walkChain(
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  tile: string,
  heading: number,
  movement: Movement,
  refs: ReadonlyArray<EdgeRef>,
  evalAmount?: AmountEval,
): string[] {
  const tiles: string[] = [tile]
  let cur: { tile: string; heading: number } = { tile, heading }
  for (const ref of refs) {
    const hop = resolveRef(tiling, overlay, cur.tile, cur.heading, movement, ref, evalAmount)
    if (!hop) break
    cur = hop
    tiles.push(cur.tile)
  }
  return tiles
}
