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
  elongatedTriangularTiling,
  truncatedHexagonalTiling,
  rhombitrihexagonalTiling,
  truncatedTrihexagonalTiling,
  snubSquareTiling,
  snubHexagonalTiling,
  rhombilleTiling,
  dodecagonSquareTiling,
  dodecagonHexTiling,
  kagomeSquareTiling,
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
    case 'elongated-triangular':
      return elongatedTriangularTiling(count)
    case 'truncated-hexagonal':
      return truncatedHexagonalTiling(count)
    case 'rhombitrihexagonal':
      return rhombitrihexagonalTiling(count)
    case 'truncated-trihexagonal':
      return truncatedTrihexagonalTiling(count)
    case 'snub-square':
      return snubSquareTiling(count)
    case 'snub-hexagonal':
      return snubHexagonalTiling(count)
    case 'rhombille':
      return rhombilleTiling(count)
    case 'dodecagon-square':
      return dodecagonSquareTiling(count)
    case 'dodecagon-hex':
      return dodecagonHexTiling(count)
    case 'kagome-square':
      return kagomeSquareTiling(count)
    case 'square':
    default:
      return squareTiling(count, count)
  }
}
