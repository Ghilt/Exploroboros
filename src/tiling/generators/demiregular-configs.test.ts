// Rigorous correctness oracle for the 2-uniform dodecagon tilings: every INTERIOR vertex (one whose
// tiles' interior angles sum to 360°) must have one of the tiling's two allowed vertex configurations,
// and both must actually occur. This catches a geometrically-valid-but-wrong tiling (e.g. the wrong
// dodecagon sub-lattice) that mere edge-pairing counts would pass.

import { describe, it, expect } from 'vitest'
import type { Tiling } from '../types'
import { dodecagonHexTiling, dodecagonSquareTiling, kagomeSquareTiling, interiorAngleDeg } from '../index'

// Canonical form of a cyclic sequence: the lexicographically smallest rotation of it or its reverse,
// so 3.4.6.4 / 4.6.4.3 / 4.6.4.3-reversed all compare equal.
function canon(seq: number[]): string {
  const rotations = (a: number[]) => a.map((_, i) => [...a.slice(i), ...a.slice(0, i)].join('.'))
  return [...rotations(seq), ...rotations([...seq].reverse())].sort()[0]
}

// Distinct interior-vertex configurations of a tiling, canonicalized.
function interiorVertexConfigs(t: Tiling): Set<string> {
  const eps = 1e-4
  const groups = new Map<string, Array<{ sides: number; cx: number; cy: number; vx: number; vy: number }>>()
  for (const node of t.nodes) {
    const sides = t.shapes[node.shape].sides
    for (const v of node.vertices) {
      const key = `${Math.round(v.x / eps)},${Math.round(v.y / eps)}`
      const entry = { sides, cx: node.centroid.x, cy: node.centroid.y, vx: v.x, vy: v.y }
      const g = groups.get(key)
      if (g) g.push(entry)
      else groups.set(key, [entry])
    }
  }
  const configs = new Set<string>()
  for (const g of groups.values()) {
    const total = g.reduce((s, e) => s + interiorAngleDeg(e.sides), 0)
    if (Math.abs(total - 360) > 0.5) continue // boundary / non-surrounded vertex
    const ordered = [...g].sort((a, b) => Math.atan2(a.cy - a.vy, a.cx - a.vx) - Math.atan2(b.cy - b.vy, b.cx - b.vx))
    configs.add(canon(ordered.map((e) => e.sides)))
  }
  return configs
}

const CASES: ReadonlyArray<{ name: string; build: () => Tiling; expect: number[][] }> = [
  { name: 'dodecagon-hex (3.4.6.12)', build: () => dodecagonHexTiling(30), expect: [[3, 4, 6, 4], [4, 6, 12]] },
  { name: 'dodecagon-square (3.4.3.12)', build: () => dodecagonSquareTiling(30), expect: [[3, 4, 3, 12], [3, 12, 12]] },
  { name: 'kagome-square (3.4.4.6; 3.6.3.6)', build: () => kagomeSquareTiling(30), expect: [[3, 4, 4, 6], [3, 6, 3, 6]] },
]

describe.each(CASES)('vertex configurations: $name', ({ build, expect: expected }) => {
  it('is exactly 2-uniform with the expected configurations', () => {
    const configs = interiorVertexConfigs(build())
    expect([...configs].sort()).toEqual(expected.map(canon).sort())
  })
})
