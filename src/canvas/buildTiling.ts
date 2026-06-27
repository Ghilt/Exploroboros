// Build a Tiling from a catalog id + a grid size N. This is the dispatch point the tiling picker
// + grid-size control feed; an unknown id falls back to the square so the canvas always renders
// (CLAUDE.md §4.3). Extend the switch as generators land.

import type { Tiling } from '../tiling'
import {
  squareTiling,
  kallebodaTiling,
  triangularTiling,
  hexagonalTiling,
  truncatedSquareTiling,
  trihexagonalTiling,
} from '../tiling'

export function buildTiling(tilingId: string, n: number): Tiling {
  const count = Math.max(1, Math.floor(n))
  switch (tilingId) {
    case 'kalleboda':
      return kallebodaTiling(count)
    case 'triangular':
      return triangularTiling(count)
    case 'hexagonal':
      return hexagonalTiling(count)
    case 'truncated-square':
      return truncatedSquareTiling(count)
    case 'trihexagonal':
      return trihexagonalTiling(count)
    case 'square':
    default:
      return squareTiling(count, count)
  }
}
