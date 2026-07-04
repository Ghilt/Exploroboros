// Every tile's `lattice` must uniquely identify it (the predicate DSL exposes `coordinate[n]`, so
// two tiles sharing a coordinate tuple would be indistinguishable), and `latticeLabels` must name
// exactly as many dimensions as the lattice has. This guards every generator at once — in
// particular the multi-shape tilings whose lattice gained a discriminator dimension, and the
// centroid-keyed ones whose old rounded lattice was not provably collision-free.

import { describe, it, expect } from 'vitest'
import type { Tiling } from '../types'
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
} from '../index'

const TILINGS: ReadonlyArray<{ name: string; build: () => Tiling }> = [
  { name: 'square', build: () => squareTiling(12, 12) },
  { name: 'kalleboda', build: () => kallebodaTiling(16) },
  { name: 'triangular', build: () => triangularTiling(20) },
  { name: 'hexagonal', build: () => hexagonalTiling(20) },
  { name: 'truncated-square', build: () => truncatedSquareTiling(20) },
  { name: 'trihexagonal', build: () => trihexagonalTiling(20) },
  { name: 'elongated-triangular', build: () => elongatedTriangularTiling(20) },
  { name: 'truncated-hexagonal', build: () => truncatedHexagonalTiling(20) },
  { name: 'rhombitrihexagonal', build: () => rhombitrihexagonalTiling(20) },
  { name: 'truncated-trihexagonal', build: () => truncatedTrihexagonalTiling(20) },
  { name: 'snub-square', build: () => snubSquareTiling(20) },
  { name: 'snub-hexagonal', build: () => snubHexagonalTiling(20) },
  { name: 'rhombille', build: () => rhombilleTiling(20) },
  { name: 'dodecagon-square', build: () => dodecagonSquareTiling(20) },
  { name: 'dodecagon-hex', build: () => dodecagonHexTiling(20) },
  { name: 'kagome-square', build: () => kagomeSquareTiling(20) },
  { name: 'penrose', build: () => penroseTiling(20) },
  { name: 'hat', build: () => hatTiling(18) },
]

describe.each(TILINGS)('lattice coordinates: $name', ({ build }) => {
  it('uniquely identify every tile', () => {
    const t = build()
    const keys = new Set(t.nodes.map((n) => n.lattice.join(',')))
    expect(keys.size).toBe(t.nodes.length)
  })

  it('match the number of latticeLabels', () => {
    const t = build()
    expect(t.meta.latticeLabels.length).toBeGreaterThan(0)
    expect(t.nodes.every((n) => n.lattice.length === t.meta.latticeLabels.length)).toBe(true)
  })
})
