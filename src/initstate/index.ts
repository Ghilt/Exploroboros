// Public surface of the Initial-state DSL + resolver. Pure & isomorphic (no React/DOM/Konva) — imported
// by the Initial-state pane, the live Workspace, and the export prepare step.

export type { Doc, InitStmt, What, Shape, LineShape, BlobShape, Guard, GuardPred } from './types'
export { parseDoc } from './parse'
export { serializeDoc, serializeStmt } from './serialize'
export { resolveNames, compileDoc } from './compile'
export { lineTiles, blobTiles } from './geometry'
export { resolveInitialState, mergeByTile, applyInitWrites } from './resolve'
export type { InitWrite, InitResolved } from './resolve'
