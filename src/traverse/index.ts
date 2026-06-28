// Public surface of the traverse engine. The Workspace imports the tick + helpers from here; the
// engine stays pure (no React/DOM/Konva) so it's unit-testable and SSR-safe.

export type { Traverser, TraverseState, TickResult } from './types'
export { stepTraversers, stepTraversersInto, chooseMove, headingOptions, rotateHeading } from './step'

// The traverser-program DSL (parse / serialize / compile / run + AST types).
export type { Program, Settings, Movement, Stmt, Action } from './lang'
export { parseProgram, serializeProgram, compileProgram, DEFAULT_SETTINGS } from './lang'
