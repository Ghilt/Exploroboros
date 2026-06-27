// Public surface of the predicate DSL. UI and the colorizer import from here.

export type {
  ArithOp,
  CompareOp,
  BoolOp,
  AttrName,
  AttrScope,
  NumberLit,
  AttrRef,
  Neg,
  Bin,
  Group,
  Expr,
  Compare,
  Not,
  BoolBin,
  PredGroup,
  Pred,
  Span,
  ParseError,
  Result,
} from './types'

export type { Token, TokenKind } from './lex'
export { lex } from './lex'

export type { EvalContext, AttrSpec } from './attributes'
export { ATTRIBUTES, attrSpec } from './attributes'

export { parsePredicate, parseExpr } from './parse'
export { serialize, serializeExpr } from './serialize'
export { evalNumber, evalPredicate } from './eval'
export { referencedShapes } from './analyze'
