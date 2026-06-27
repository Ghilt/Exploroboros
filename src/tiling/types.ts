// Core data model for the tiling engine. Pure & isomorphic: no React/DOM/canvas, no
// pixels — geometry is in abstract world coordinates (unit = edge length), y-up, vertices
// CCW. Topology (the node graph) and geometry (render info) live side by side so the
// future traverse DSL can read topology while a renderer reads geometry.

export type Vec2 = { x: number; y: number }

// A polygon class (e.g. 'square'). One tiling may mix several.
export type ShapeType = string

export type ShapeDef = {
  type: ShapeType
  sides: number
  interiorAngleDeg: number
  // oppositeSides[k] = the side(s) geometrically opposite local side k.
  // Length 1 for even-sided polygons; length 2 for odd-sided ones (the two sides
  // flanking the opposite vertex), so triangles/pentagons work through one API.
  oppositeSides: ReadonlyArray<ReadonlyArray<number>>
}

// Geometry of one side (render info + absolute/relative direction for the DSL).
export type SideGeometry = {
  localIndex: number // 0..N-1 going CCW; gives relative/turn semantics
  a: Vec2
  b: Vec2
  midpoint: Vec2
  normalAngle: number // outward normal, radians; gives absolute/compass semantics
}

// A tile's side, linked into the shared edge graph by index.
export type Side = {
  geometry: SideGeometry
  edgeId: number
}

// One endpoint of an edge: a tile plus which of its local sides.
export type EdgeEnd = { tile: string; side: number }

// A node in the graph. `id`/`lattice` derive from intrinsic structure, never pixels,
// so they stay stable across zoom/canvas changes.
export type TileNode = {
  id: string
  shape: ShapeType
  vertices: ReadonlyArray<Vec2>
  centroid: Vec2
  lattice: ReadonlyArray<number>
  sides: ReadonlyArray<Side>
}

// A first-class edge. `b === null` marks a boundary (perimeter) edge. `p`/`q` are the
// segment endpoints in end `a`'s winding order — arbitrary relative to any querying tile,
// so read per-tile direction from a side's own geometry, not from here.
export type TilingEdge = {
  id: number
  a: EdgeEnd
  b: EdgeEnd | null
  p: Vec2
  q: Vec2
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export type TilingMeta = {
  id: string
  name: string
  vertexConfig: string // e.g. '4.4.4.4'
  chiral: boolean
  edgeToEdge: boolean
  // Names for each lattice dimension, in order — `latticeLabels[k]` names `TileNode.lattice[k]`.
  // Length === every node's lattice length. Multi-shape tilings append a discriminator dimension
  // (orientation / class / slot) so `lattice` uniquely identifies each tile; the Inspect window and
  // the predicate DSL's `coordinate[n]` read these. Single-shape tilings keep their two coords.
  latticeLabels: ReadonlyArray<string>
}

// A whole tiling — an immutable substrate: plain objects, arrays, string ids, and a plain
// `shapes` record, so JSON.stringify/parse round-trips it (future SSR caching). Per-run
// mutable state (visit counts, colours) belongs in separate overlays keyed by tile/edge id,
// not on these nodes/edges. Adjacency is derived from sides[].edgeId -> edges -> other EdgeEnd.
export type Tiling = {
  meta: TilingMeta
  nodes: ReadonlyArray<TileNode>
  edges: ReadonlyArray<TilingEdge>
  shapes: Readonly<Record<ShapeType, ShapeDef>>
  bounds: Bounds
}

// What a generator emits; stitch() turns these into a Tiling.
export type RawTile = {
  id: string
  shape: ShapeType
  vertices: ReadonlyArray<Vec2>
  lattice: ReadonlyArray<number>
}
