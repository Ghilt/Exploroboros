// Public surface of the traverser-program DSL.

export type {
  Movement,
  EdgeRef,
  Chain,
  EdgeTarget,
  GuardPred,
  Guard,
  DExpr,
  WriteTarget,
  SettingName,
  Action,
  Rule,
  Directive,
  Reset,
  Stmt,
  Settings,
  Program,
} from './types'
export { DEFAULT_SETTINGS } from './types'

export { parseProgram, parseChainFragment } from './parse'
export { serializeProgram } from './serialize'
export { resolveNames, compileProgram } from './compile'
export { resolveRef, resolveChain, walkChain, type Hop } from './edges'
export { scanPaths, type PathOccurrence, type OccurrenceBase } from './scanPaths'
export { resolveWalk, computeFound } from './resolveWalk'
export { runProgram, resolveAbsolutePath, makeMatchAt, type WalkerState, type ExecInput, type ExecResult, type Branch, type TileWrite } from './exec'
export { findExtreme, maintainFindExtreme, type FindLowestCache, type Numbering, type MatchAt } from './findLowest'
