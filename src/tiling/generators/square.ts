// Square tiling (4.4.4.4) — the first concrete generator. It only lays out raw squares;
// stitch() builds the edge graph. Adding the other uniform tilings follows this shape.

import type { RawTile, Tiling, TilingMeta } from '../types'
import { SQUARE } from '../shapes'
import { stitch } from '../stitch'

const SQUARE_META: TilingMeta = {
  id: 'square',
  name: 'Square tiling',
  vertexConfig: '4.4.4.4',
  chiral: false,
  edgeToEdge: true,
}

// rows x cols unit squares on the integer lattice (y-up). Tile (r,c) spans
// [c,c+1] x [r,r+1] in world units, scaled by `size`. Vertices wind CCW from the
// bottom-left, so local sides are 0=S, 1=E, 2=N, 3=W with opposites 0<->2 and 1<->3.
export function squareTiling(rows: number, cols: number, size = 1): Tiling {
  const raws: RawTile[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = c * size
      const y0 = r * size
      const x1 = x0 + size
      const y1 = y0 + size
      raws.push({
        id: `sq:${r},${c}`,
        shape: SQUARE.type,
        lattice: [r, c],
        vertices: [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 },
        ],
      })
    }
  }
  return stitch(raws, { [SQUARE.type]: SQUARE }, SQUARE_META)
}
