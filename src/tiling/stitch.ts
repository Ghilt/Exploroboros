// The generic step shared by every tiling: take raw polygons and weave them into a node
// graph by detecting coincident edges. Adding a new tiling means writing a generator that
// emits RawTiles — never touching this.

import type {
  Bounds,
  EdgeEnd,
  RawTile,
  ShapeDef,
  ShapeType,
  Side,
  TileNode,
  Tiling,
  TilingEdge,
  TilingMeta,
} from './types'
import { centroid, edgeMidpoint, normalAngle, quantizeKey, signedArea } from './geometry'

export type StitchOptions = { tolerance?: number }

// The square tiling is exact; trig-based generators may need a looser tolerance.
const DEFAULT_TOLERANCE = 1e-6

export function stitch(
  raws: ReadonlyArray<RawTile>,
  shapes: Readonly<Record<ShapeType, ShapeDef>>,
  meta: TilingMeta,
  opts: StitchOptions = {},
): Tiling {
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE

  // 1. Build nodes with per-side geometry; edgeId is filled in once edges are paired.
  const nodes: TileNode[] = raws.map((raw) => {
    const verts = raw.vertices
    if (signedArea(verts) <= 0) {
      throw new Error(`stitch: tile '${raw.id}' must be wound counter-clockwise (CCW)`)
    }
    const n = verts.length
    const sides: Side[] = []
    for (let k = 0; k < n; k += 1) {
      const a = verts[k]
      const b = verts[(k + 1) % n]
      sides.push({
        geometry: { localIndex: k, a, b, midpoint: edgeMidpoint(a, b), normalAngle: normalAngle(a, b) },
        edgeId: -1,
      })
    }
    return { id: raw.id, shape: raw.shape, vertices: verts, centroid: centroid(verts), lattice: raw.lattice, sides }
  })

  const nodeById = new Map<string, TileNode>()
  for (const node of nodes) {
    if (nodeById.has(node.id)) {
      throw new Error(`stitch: duplicate tile id '${node.id}' in tiling '${meta.id}'`)
    }
    nodeById.set(node.id, node)
  }

  // 2. Bucket every side by its order-independent endpoint key.
  const buckets = new Map<string, EdgeEnd[]>()
  for (const node of nodes) {
    for (const side of node.sides) {
      const key = quantizeKey(side.geometry.a, side.geometry.b, tol)
      const end: EdgeEnd = { tile: node.id, side: side.geometry.localIndex }
      const bucket = buckets.get(key)
      if (bucket) bucket.push(end)
      else buckets.set(key, [end])
    }
  }

  // 3. One edge per bucket: size 1 = boundary, size 2 = interior. Larger is non-manifold
  // and never happens for clean edge-to-edge tilings.
  const edges: TilingEdge[] = []
  for (const ends of buckets.values()) {
    if (ends.length > 2) {
      throw new Error(`stitch: edge shared by ${ends.length} sides in tiling '${meta.id}' (non-manifold)`)
    }
    const a = ends[0]
    const b = ends.length === 2 ? ends[1] : null
    const sideA = sideOf(nodeById, a)
    const edgeId = edges.length
    edges.push({ id: edgeId, a, b, p: sideA.geometry.a, q: sideA.geometry.b })
    sideA.edgeId = edgeId
    if (b) sideOf(nodeById, b).edgeId = edgeId
  }

  // 4. Every side must now belong to an edge.
  for (const node of nodes) {
    for (const side of node.sides) {
      if (side.edgeId < 0) {
        throw new Error(`stitch: side ${node.id}#${side.geometry.localIndex} was left unstitched`)
      }
    }
  }

  return { meta, nodes, edges, shapes, bounds: boundsOf(nodes) }
}

function sideOf(nodeById: ReadonlyMap<string, TileNode>, end: EdgeEnd): Side {
  const node = nodeById.get(end.tile)
  if (!node) throw new Error(`stitch: unknown tile '${end.tile}'`)
  return node.sides[end.side]
}

function boundsOf(nodes: ReadonlyArray<TileNode>): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    for (const v of node.vertices) {
      if (v.x < minX) minX = v.x
      if (v.y < minY) minY = v.y
      if (v.x > maxX) maxX = v.x
      if (v.y > maxY) maxY = v.y
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}
