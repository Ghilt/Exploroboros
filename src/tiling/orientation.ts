// A tiling-AGNOSTIC orientation index: which rotational variant of its shape a tile is, as a small
// 0-based integer (kalleboda wedges 0..3 / octagons 0; up-vs-down triangles 0/1; the ±15° snub squares
// 0/1; a single-rotation shape like a square 0). Derived purely from geometry — rank a tile's
// tileRotationDeg among the DISTINCT rotation buckets of tiles of the SAME shape class — so it means
// the same thing on every tiling, unlike the tiling-specific lattice discriminator ('slot' on
// kalleboda, 'orientation' on triangular, 'class' on the semiregulars). This is what lets
// orientation-routed traversers (classic, sierpinski) transfer between tilings: route by
// `orientation == k` instead of the non-portable `coordinate[slot]`.
//
// The float rotation is bucketed (with wrap-around, so 359deg and 0deg coincide) before ranking, so a
// rounding wobble never splits one real orientation into two. Memoized per Tiling in a WeakMap — the
// immutable Tiling is never mutated and the map is GC'd with it — mirroring graph.ts's indexCache.

import type { Tiling } from './types'
import { tileRotationDeg } from './geometry'

// Clustering tolerance in degrees. Same-orientation tiles can compute rotations a degree or two apart
// (welding perturbs vertices slightly per cell — e.g. one wedge orientation reads 157 on one cell, 158
// on another), so we CLUSTER nearby rotations rather than snapping to a fixed grid (a fixed grid splits
// a cluster that straddles a boundary, the bug this replaces). A shape's distinct orientations are far
// apart (wedges 90deg, up/down triangles 180deg, snub squares 30deg), so a few degrees never merges two.
const ROT_TOL = 6

const cache = new WeakMap<Tiling, Map<string, number>>()

// Group sorted distinct degrees into clusters where consecutive gaps are <= ROT_TOL, merging the
// first/last clusters if they wrap across 360. Returns deg -> 0-based cluster index (ascending).
function clusterDegrees(distinct: number[]): Map<number, number> {
  const clusters: number[][] = []
  for (const d of distinct) {
    const last = clusters[clusters.length - 1]
    if (last && d - last[last.length - 1] <= ROT_TOL) last.push(d)
    else clusters.push([d])
  }
  // Wrap-around: a cluster near 360 and one near 0 are the same orientation.
  if (clusters.length > 1) {
    const first = clusters[0]
    const last = clusters[clusters.length - 1]
    if (first[0] + 360 - last[last.length - 1] <= ROT_TOL) {
      clusters[0] = [...last, ...first]
      clusters.pop()
    }
  }
  const m = new Map<number, number>()
  clusters.forEach((cluster, i) => cluster.forEach((d) => m.set(d, i)))
  return m
}

function build(tiling: Tiling): Map<string, number> {
  // Each tile's rotation, and the distinct rotations present per shape class.
  const tileRot = new Map<string, number>()
  const perShape = new Map<string, Set<number>>()
  for (const node of tiling.nodes) {
    const deg = tileRotationDeg(node.vertices, node.centroid)
    tileRot.set(node.id, deg)
    let set = perShape.get(node.shape)
    if (!set) perShape.set(node.shape, (set = new Set<number>()))
    set.add(deg)
  }
  // Per shape: cluster the distinct rotations into orientation indices.
  const degToOrient = new Map<string, Map<number, number>>()
  for (const [shape, set] of perShape) {
    degToOrient.set(shape, clusterDegrees([...set].sort((a, b) => a - b)))
  }
  const out = new Map<string, number>()
  for (const node of tiling.nodes) {
    out.set(node.id, degToOrient.get(node.shape)!.get(tileRot.get(node.id)!)!)
  }
  return out
}

// tile id -> orientation index. Memoized per Tiling.
export function orientationMap(tiling: Tiling): ReadonlyMap<string, number> {
  let m = cache.get(tiling)
  if (!m) cache.set(tiling, (m = build(tiling)))
  return m
}

// A tile's orientation index (0 for an unknown id — matches the DSL's missing-value fallback).
export function tileOrientation(tiling: Tiling, id: string): number {
  return orientationMap(tiling).get(id) ?? 0
}
