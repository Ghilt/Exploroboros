import { describe, it, expect } from 'vitest'
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
  clockwiseEdgeOrder,
} from './index'

const TILINGS: Record<string, (n: number) => ReturnType<typeof kallebodaTiling>> = {
  square: (n) => squareTiling(n, n), // square takes (rows, cols); the rest take a single size
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
}

// Angular distance (degrees, 0..180) from an outward normal to straight-up (north). Computed WITHOUT
// clockwiseFromTopKey, so this test independently verifies the edge ordering rather than restating it.
function northness(normalAngle: number): number {
  const deg = (normalAngle * 180) / Math.PI
  let d = (((90 - deg) % 360) + 360) % 360
  if (d > 180) d = 360 - d
  return d
}

// The user-facing rule: edge 0 is the tile's most-northward edge, then clockwise. The 0/360 seam at
// north made a due-north edge whose normal landed a hair over 90° sort LAST instead (the slot-0
// kalleboda octagon bug). This guards that invariant on EVERY tile of EVERY tiling.
describe('edge numbering: edge 0 is the most-north edge on every tile', () => {
  for (const [id, gen] of Object.entries(TILINGS)) {
    it(id, () => {
      const t = gen(12)
      for (const node of t.nodes) {
        const order = clockwiseEdgeOrder(node)
        const n = node.sides.length
        const edge0 = northness(node.sides[order[0]].geometry.normalAngle)
        for (const s of node.sides) {
          // No side is more north than edge 0 (tolerance covers a ties-at-north tile + float noise).
          expect(northness(s.geometry.normalAngle), `${id} ${node.id}`).toBeGreaterThanOrEqual(edge0 - 1e-3)
        }
        // Consecutive edge numbers walk the boundary clockwise — each is the next local side round the
        // perimeter (CCW winding → clockwise = decreasing index). So the numbering stays monotonic around
        // the boundary even on concave tiles (the wedge), instead of scattering by outward-normal angle.
        for (let i = 0; i < n; i += 1) {
          const step = (order[i] - order[(i + 1) % n] + n) % n
          expect(step, `${id} ${node.id} edge ${i}->${i + 1} (sides ${order[i]}->${order[(i + 1) % n]})`).toBe(1)
        }
      }
    })
  }
})
