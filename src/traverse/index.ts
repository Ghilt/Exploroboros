// Public surface of the traverse engine. The Workspace imports the tick + helpers from here; the
// engine stays pure (no React/DOM/Konva) so it's unit-testable and SSR-safe.

export type { Traverser, TraverseState, TickResult } from './types'
export { stepTraversers, stepTraversersTraced, stepTraversersInto, rotateHeading, renameSeedDefs } from './step'

// The find-lowest/highest-tile bookmark cache + numbering bundle (built with src/tiling's numberingFor)
// that a run threads into TraverseState so searches don't rescan every tick.
export type { FindLowestCache, Numbering } from './lang'

// The per-tick decision trace (the debug log's data).
export type { TickTrace, TraverserTrace, StmtTrace, CandidateTrace, GuardEval, ReadTile, RejectReason, CoalesceTrace, DropTrace, WriteTargetTrace } from './trace'

// The traverser-program DSL (parse / serialize / compile / run + AST types).
export type { Program, Settings, Movement, Stmt, Action } from './lang'
export { parseProgram, serializeProgram, compileProgram, DEFAULT_SETTINGS } from './lang'

// Walker-free `.`-path resolver (absolute edge chains + `tile N`) — the colorizer uses this so
// predicates like `[A.e0] > 0` can read a neighbouring tile without a walker.
export { resolveAbsolutePath } from './lang'

// Path preview: scan a program's text for its move-chains / `@`-paths (with spans), and resolve one into
// the ordered tiles it walks — so the Traversers editor can light up a selected path on the canvas.
// `computeFound` runs one tick to resolve the walker's `fN` (find-tile) results for the preview.
export { scanPaths, resolveWalk, computeFound } from './lang'
export type { PathOccurrence, OccurrenceBase } from './lang'

// Downloadable whole-run trace log (the analysis artifact): runs the setup to completion traced.
export { buildTraverseLog, serializeTraverseLog, traverseLogFilename, TRAVERSE_LOG_VERSION, type TraverseLog, type TraverseLogMeta } from './traceLog'
