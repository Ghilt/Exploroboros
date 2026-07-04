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
  tileRotationDeg,
  normalAngle,
  signedArea,
  scaleAround,
  clockwiseFromTopKey,
} from './geometry'
export { tileOrientation, orientationMap } from './orientation'
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
  headingArrowDir,
  edgeToLocalSide,
  localSideToEdge,
  nearestEdge,
  edgeNormalAngle,
} from './graph'
export { squareTiling } from './generators/square'
export { kallebodaTiling } from './generators/kalleboda'
export { triangularTiling } from './generators/triangular'
export { hexagonalTiling } from './generators/hexagonal'
export { truncatedSquareTiling } from './generators/truncated-square'
export { trihexagonalTiling } from './generators/trihexagonal'
export { elongatedTriangularTiling } from './generators/elongated-triangular'
export { truncatedHexagonalTiling } from './generators/truncated-hexagonal'
export { rhombitrihexagonalTiling } from './generators/rhombitrihexagonal'
export { truncatedTrihexagonalTiling } from './generators/truncated-trihexagonal'
export { snubSquareTiling } from './generators/snub-square'
export { snubHexagonalTiling } from './generators/snub-hexagonal'
export { rhombilleTiling } from './generators/rhombille'
export { dodecagonSquareTiling } from './generators/dodecagon-square'
export { dodecagonHexTiling } from './generators/dodecagon-hex'
export { kagomeSquareTiling } from './generators/kagome-square'
