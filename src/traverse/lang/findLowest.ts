// The efficient backing structure for `find-lowest-tile` / `find-highest-tile`. A GLOBAL search for the
// lowest- (or highest-) numbered tile matching a walker-free predicate would be O(tiles) per tick per
// query if done naively; instead each query keeps a BOOKMARK (a cursor into the numbering order) under
// the invariant that every tile BEFORE it is a known non-match, so a read RESUMES from the bookmark
// rather than the start.
//
// Because only tiles the tick actually WROTE can change whether a tile matches, maintenance re-checks
// just those (plus, for a neighbour-reading predicate, their neighbours) and nudges the bookmark back if
// a changed tile before it now matches. So `visited == 0`-style searches march the bookmark forward and
// cost ~one full pass across a whole run (not one per tick); a search whose value can go back down
// (`A == 0`) only pays for the handful of tiles that changed.
//
// Pure & isomorphic. It never evaluates a predicate itself — the caller supplies a `MatchAt` closure
// (over the frozen overlay for a read, the new overlay for maintenance), so this module needs no
// evaluator/colorizer import and stays free of an import cycle with exec.ts.

import { uniqueNeighbors, type Tiling } from '../../tiling'
import { serialize as serializePred, predPathReach, type PathReach, type Pred } from '../../dsl'
import type { FindDir } from './types'

// The board numbering the search runs over: tile ids in ascending "number" (index 0 = the lowest), with
// an O(1) position lookup — both memoized by src/tiling/numbering. `posOf` is used only by maintenance.
export type Numbering = { order: ReadonlyArray<string>; posOf: (id: string) => number }

// Evaluate a walker-free predicate at a tile id against the overlay the caller closed over (frozen for a
// read, post-write for maintenance). Returns false for a missing tile.
export type MatchAt = (pred: Pred, id: string) => boolean

// Per query (keyed by direction + serialized predicate text, so identical searches share one bookmark):
// the cursor, the step it was last valid for (a stale stamp ⇒ the overlay changed out-of-band ⇒ rescan),
// and the pred/reach needed to maintain it.
type QueryState = { cursor: number; stamp: number; dir: FindDir; pred: Pred; reach: PathReach }
export type FindLowestCache = Map<string, QueryState>

// READ: the lowest/highest-numbered tile whose `pred` holds, resuming from the query's bookmark. Returns
// the tile id, or null if none matches. `step` validates the bookmark — a mismatch (first use, or an
// out-of-band overlay change) triggers a fresh scan from the start.
export function findExtreme(
  order: ReadonlyArray<string>,
  dir: FindDir,
  pred: Pred,
  cache: FindLowestCache,
  step: number,
  matchAt: MatchAt,
): string | null {
  const key = `${dir}:${serializePred(pred)}`
  const start = dir === 'low' ? 0 : order.length - 1
  let st = cache.get(key)
  if (!st) {
    st = { cursor: start, stamp: step, dir, pred, reach: predPathReach(pred) }
    cache.set(key, st)
  } else if (st.stamp !== step) {
    st.cursor = start
    st.stamp = step
  }
  if (dir === 'low') {
    let i = st.cursor
    while (i < order.length && !matchAt(pred, order[i])) i += 1
    st.cursor = i
    return i < order.length ? order[i] : null
  }
  let i = st.cursor
  while (i >= 0 && !matchAt(pred, order[i])) i -= 1
  st.cursor = i
  return i >= 0 ? order[i] : null
}

// MAINTAIN: after a tick's writes are applied, bring every live query's bookmark up to date for the NEW
// overlay (via `matchAt`, which must close over that overlay). Only WRITTEN tiles can change a match; a
// 'neighbor' predicate also depends on writes to a tile's neighbours; a 'global' one (multi-hop / .tile N)
// can't be bounded, so its bookmark is reset for a full rescan. `nextStep` re-stamps every bookmark.
export function maintainFindExtreme(
  tiling: Tiling,
  order: ReadonlyArray<string>,
  posOf: (id: string) => number,
  written: ReadonlySet<string>,
  cache: FindLowestCache,
  nextStep: number,
  matchAt: MatchAt,
): void {
  for (const st of cache.values()) {
    if (st.reach === 'global') {
      st.cursor = st.dir === 'low' ? 0 : order.length - 1
      st.stamp = nextStep
      continue
    }
    // The tiles whose match COULD have flipped: those written this tick, plus (for a neighbour-reading
    // predicate) the neighbours of written tiles — a tile reads a neighbour, so a write to T flips T's
    // readers, which are exactly T's neighbours (adjacency is symmetric).
    let candidates: Iterable<string> = written
    if (st.reach === 'neighbor') {
      const set = new Set<string>(written)
      for (const id of written) for (const nb of uniqueNeighbors(tiling, id)) set.add(nb)
      candidates = set
    }
    // For 'low', drop the bookmark to the LOWEST changed position strictly before it that now matches
    // (unchanged tiles before it were non-matching and stay so). For 'high', raise it to the highest
    // changed position strictly after it. Otherwise leave it (a now-non-matching cursor tile is handled
    // by the next read scanning forward — maintenance only ever pulls the bookmark back).
    let best = st.cursor
    for (const id of candidates) {
      const p = posOf(id)
      if (p < 0) continue
      if (st.dir === 'low' ? p >= best : p <= best) continue
      if (matchAt(st.pred, id)) best = p
    }
    st.cursor = best
    st.stamp = nextStep
  }
}
