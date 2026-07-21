// Build a Tiling from a catalog id + a grid size N. This is the dispatch point the tiling picker
// + grid-size control feed; an unknown id falls back to the square so the canvas always renders
// (CLAUDE.md §4.3). Extend the map as generators land.

import type { Tiling } from '../tiling'
import {
  cropTilingToAspect,
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

// Every generator except the square takes ONE scalar count and lays its tiles into a square region.
const SCALAR_GENERATORS: Record<string, (n: number) => Tiling> = {
  kalleboda: kallebodaTiling,
  triangular: triangularTiling,
  hexagonal: hexagonalTiling,
  'truncated-square': truncatedSquareTiling,
  trihexagonal: trihexagonalTiling,
  'elongated-triangular': elongatedTriangularTiling,
  'truncated-hexagonal': truncatedHexagonalTiling,
  rhombitrihexagonal: rhombitrihexagonalTiling,
  'truncated-trihexagonal': truncatedTrihexagonalTiling,
  'snub-square': snubSquareTiling,
  'snub-hexagonal': snubHexagonalTiling,
  rhombille: rhombilleTiling,
  'dodecagon-square': dodecagonSquareTiling,
  'dodecagon-hex': dodecagonHexTiling,
  'kagome-square': kagomeSquareTiling,
  penrose: penroseTiling,
  hat: hatTiling,
}

// `nW`/`nH` are tile counts across the width/height axes. The square generator lays out a genuinely
// rectangular grid (rows != cols) directly. Every other generator only takes one scalar count, so for
// a lopsided export we build its square patch at the LONGER axis (enough tiles along it) and crop it
// to the requested w:h rectangle — the tiling FILLS the frame like the square does, instead of a small
// square patch adrift in the middle. A square request (nW === nH — every live grid, any square export)
// takes the plain single-count path, unchanged.
export function buildTiling(tilingId: string, nW: number, nH: number = nW): Tiling {
  const w = Math.max(1, Math.floor(nW))
  const h = Math.max(1, Math.floor(nH))
  const gen = SCALAR_GENERATORS[tilingId]
  // 'square' + any unknown id fall back to the square, which honours a rectangular grid on its own.
  if (!gen) return squareTiling(h, w)
  const tiling = gen(Math.max(w, h))
  return w === h ? tiling : cropTilingToAspect(tiling, w, h)
}
