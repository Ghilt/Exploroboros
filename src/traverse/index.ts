// Public surface of the traverse engine. The Workspace imports the tick + helpers from here; the
// engine stays pure (no React/DOM/Konva) so it's unit-testable and SSR-safe.

export type { Traverser, TraverseState, TickResult } from './types'
export { stepTraversers, stepTraversersTraced, stepTraversersInto, rotateHeading } from './step'

// The per-tick decision trace (the debug log's data).
export type { TickTrace, TraverserTrace, StmtTrace, CandidateTrace, GuardEval, ReadTile, RejectReason, CoalesceTrace, DropTrace } from './trace'

// The traverser-program DSL (parse / serialize / compile / run + AST types).
export type { Program, Settings, Movement, Stmt, Action } from './lang'
export { parseProgram, serializeProgram, compileProgram, DEFAULT_SETTINGS } from './lang'

// Walker-free `@`-path resolver (absolute edge chains + `tile N`) — the colorizer uses this so
// predicates like `[A@e0] > 0` can read a neighbouring tile without a walker.
export { resolveAbsolutePath } from './lang'
