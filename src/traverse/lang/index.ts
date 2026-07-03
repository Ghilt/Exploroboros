// Public surface of the traverser-program DSL.

export type {
  Movement,
  EdgeRef,
  Chain,
  EdgeTarget,
  GuardPred,
  Guard,
  DExpr,
  Reg,
  SettingName,
  Action,
  Rule,
  Directive,
  Reset,
  Stmt,
  AutoPlaceLine,
  AutoPlaceRule,
  Settings,
  Program,
} from './types'
export { DEFAULT_SETTINGS } from './types'

export { parseProgram } from './parse'
export { serializeProgram, serializeAutoPlace } from './serialize'
export { resolveNames, compileProgram } from './compile'
export { resolveRef, resolveChain, type Hop } from './edges'
export { runProgram, type WalkerState, type ExecInput, type ExecResult, type Branch, type TileWrite } from './exec'
