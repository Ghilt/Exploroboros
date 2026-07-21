import type { Tiling } from '../tiling'
import { uniqueNeighbors } from '../tiling'

// Shortest chain of edge-adjacent tiles from `from` to `to` that never passes THROUGH a blocked tile
// (the path's existing tiles), so bridging a gap stays self-avoiding. Returns [from, …, to], or null if
// `to` can't be reached without reusing a tile. Plain BFS on the adjacency graph (boards are ~100 tiles).
function routeBetween(tiling: Tiling, from: string, to: string, blocked: ReadonlySet<string>): string[] | null {
  if (from === to) return [from]
  const prev = new Map<string, string>()
  const seen = new Set<string>([from])
  const queue: string[] = [from]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const n of uniqueNeighbors(tiling, cur)) {
      if (seen.has(n)) continue
      if (n !== to && blocked.has(n)) continue // route around used tiles (but `to` itself is the goal)
      seen.add(n)
      prev.set(n, cur)
      if (n === to) {
        const route = [to]
        let p = cur
        while (p !== from) {
          route.push(p)
          p = prev.get(p) as string
        }
        route.push(from)
        return route.reverse()
      }
      queue.push(n)
    }
  }
  return null
}

// Grow a self-avoiding trace path toward the tile now under the pointer. Rules, in order:
//  - null / the current head            -> no change
//  - a tile already in the path         -> BACKTRACK: retreat to it (drop everything after). Landing on
//                                          ANY earlier tile works, so a fast reverse drag can't overshoot.
//  - any other tile                     -> CONNECT: append the shortest chain of unused tiles from the
//                                          head to it. So even a fast drag that skipped tiles ends up
//                                          connected — the path always reaches the cursor (it "keeps up").
// Returns the SAME array reference when nothing changes, so the caller can skip a re-render.
export function extendTrace(tiling: Tiling, path: ReadonlyArray<string>, tile: string | null): ReadonlyArray<string> {
  if (tile == null) return path
  if (path.length === 0) return [tile]
  const last = path[path.length - 1]
  if (tile === last) return path
  const idx = path.indexOf(tile)
  if (idx >= 0) return path.slice(0, idx + 1) // cursor is back on an earlier tile — retreat to it
  const route = routeBetween(tiling, last, tile, new Set(path))
  if (route && route.length > 1) return [...path, ...route.slice(1)]
  return path // unreachable without reusing a tile (e.g. the cursor is walled in by the path) — leave as-is
}
