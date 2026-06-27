// Public surface of the pure canvas helpers (no Konva/DOM). The Konva renderer and the
// Workspace import transform/hit-test/stroke/clipboard/factory logic from here.

export type { View, Size } from './view'
export { worldToScreen, screenToWorld, clampScale, zoomAt, panBy, fitToView, clampView } from './view'
export { pointInPolygon, representativeTileSize, SpatialHash, pickTile } from './pick'
export { tilesAlongSegment } from './stroke'
export type { TileState, Registry, PaintTarget } from './overlay'
export {
  EMPTY_TILE_STATE,
  MANUAL_STEP,
  tileState,
  visitCount,
  overlayIsEmpty,
  addVisit,
  removeManualVisit,
  bumpRegistry,
  applyPaint,
  addVisits,
  clearTraverserVisits,
  hasTraverserVisits,
} from './overlay'
export type { TileClip } from './clipboard'
export { clipFromTile, canPaste, applyClip } from './clipboard'
export { buildTiling } from './buildTiling'
