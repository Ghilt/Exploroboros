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
  penroseTiling,
  hatTiling,
} from '../tiling'

// `nW`/`nH` are tile counts across the width/height axes. Only the square generator actually supports
// a rectangular (rows != cols) grid; every other generator takes one scalar count, so they get the
// average of the two axes (keeps a single-arg call — nH defaulting to nW — exactly as before).
export function buildTiling(tilingId: string, nW: number, nH: number = nW): Tiling {
  const w = Math.max(1, Math.floor(nW))
  const h = Math.max(1, Math.floor(nH))
  const count = Math.max(1, Math.round((w + h) / 2))
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
    case 'penrose':
      return penroseTiling(count)
    case 'hat':
      return hatTiling(count)
    case 'square':
      return squareTiling(h, w)
    default:
      return squareTiling(count, count)
  }
}
