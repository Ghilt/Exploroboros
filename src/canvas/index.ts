// Public surface of the pure canvas helpers (no Konva/DOM). The Konva renderer and the
// Workspace import transform/hit-test/stroke/clipboard/factory logic from here.

export type { View, Size, ReframeInput, ReframeResult } from './view'
export { worldToScreen, screenToWorld, clampScale, zoomAt, panBy, fitToView, clampView, centerOn, reframeView } from './view'
export { pointInPolygon, representativeTileSize, SpatialHash, pickTile, tilesInRect } from './pick'
export { tilesAlongSegment } from './stroke'
export { flattenColor, inflatePolygon, FLUSH_OVERLAP_PX } from './flush'
export type { TileState, Registry, PaintTarget, RegWrite } from './overlay'
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
  applyRegistryWrites,
  setVisits,
  addVisits,
  clearTraverserVisits,
  restoreRegistries,
  authoredBoard,
  hasTraverserVisits,
} from './overlay'
export type { TileClip } from './clipboard'
export { clipFromTile, canPaste, applyClip } from './clipboard'
export { buildTiling } from './buildTiling'
export { transcribeGesture } from './transcribe'
export type { TranscribeResult, TranscribeKind } from './transcribe'
export { pathPreviewColors, colorForLine } from './pathPreviewColors'
export type { SelSpan, PathPreviewEntry } from './pathPreviewSelect'
export { isWholeProgram, occurrenceInSelection, buildPathPreview, lineColorsFor } from './pathPreviewSelect'
