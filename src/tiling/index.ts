// Public surface of the tiling engine. Renderers and the future DSL import from here.

export type {
  Vec2,
  ShapeType,
  ShapeDef,
  SideGeometry,
  Side,
  EdgeEnd,
  TileNode,
  TilingEdge,
  Bounds,
  TilingMeta,
  Tiling,
  RawTile,
} from './types'

export {
  regularPolygonVertices,
  centroid,
  edgeMidpoint,
  normalAngle,
  signedArea,
  scaleAround,
  clockwiseFromTopKey,
} from './geometry'
export { oppositeSides, interiorAngleDeg, makeShapeDef, SQUARE } from './shapes'
export { stitch } from './stitch'
export type { StitchOptions } from './stitch'
export {
  nodeById,
  sideToEdge,
  isBoundary,
  across,
  neighborEdges,
  uniqueNeighbors,
  opposite,
  clockwiseEdgeOrder,
} from './graph'
export { squareTiling } from './generators/square'
export { kallebodaTiling } from './generators/kalleboda'
export { triangularTiling } from './generators/triangular'
export { hexagonalTiling } from './generators/hexagonal'
export { truncatedSquareTiling } from './generators/truncated-square'
export { trihexagonalTiling } from './generators/trihexagonal'
