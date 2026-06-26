// Shape (polygon-class) definitions. The opposite-edge concept is intrinsic to a shape's
// side count, so it lives here rather than in the stitched graph.

import type { ShapeDef, ShapeType } from './types'

// The side(s) opposite local side k of an N-gon. Even N has one true opposite,
// (k + N/2) % N. Odd N has none — the spot opposite a side is a vertex, so we return the
// two sides flanking it: (k + (N-1)/2) % N and (k + (N+1)/2) % N.
export function oppositeSides(k: number, n: number): number[] {
  if (n % 2 === 0) {
    return [(k + n / 2) % n]
  }
  return [(k + (n - 1) / 2) % n, (k + (n + 1) / 2) % n]
}

export function interiorAngleDeg(n: number): number {
  return ((n - 2) * 180) / n
}

export function makeShapeDef(type: ShapeType, n: number): ShapeDef {
  const opposites: number[][] = []
  for (let k = 0; k < n; k += 1) {
    opposites.push(oppositeSides(k, n))
  }
  return {
    type,
    sides: n,
    interiorAngleDeg: interiorAngleDeg(n),
    oppositeSides: opposites,
  }
}

export const SQUARE: ShapeDef = makeShapeDef('square', 4)
