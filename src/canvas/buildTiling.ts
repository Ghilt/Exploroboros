// Build a Tiling from a catalog id + a grid size N (tile count = N*N for the square). This is
// the dispatch point the tiling picker + grid-size control feed; only the square has a
// generator today, so any other id falls back to the square so the canvas always renders
// (CLAUDE.md §4.3). Extend the switch as generators land.

import type { Tiling } from '../tiling'
import { squareTiling } from '../tiling'

export function buildTiling(tilingId: string, n: number): Tiling {
  const count = Math.max(1, Math.floor(n))
  switch (tilingId) {
    case 'square':
    default:
      return squareTiling(count, count)
  }
}
