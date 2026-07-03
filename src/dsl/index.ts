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
  RegLetter,
  RegRead,
  Expr,
  Compare,
  ShapeTest,
  Not,
  BoolBin,
  PredGroup,
  Pred,
  PathSeg,
  TilePath,
  Span,
  ParseError,
  Result,
} from './types'

export type { Token, TokenKind } from './lex'
export { lex } from './lex'

export type { EvalContext, AttrSpec, TraverserAttrs } from './attributes'
export { ATTRIBUTES, TILE_ATTRIBUTES, RAMP_ATTRIBUTES, attrSpec } from './attributes'

export { parsePredicate, parseExpr } from './parse'
export { serialize, serializeExpr, serializePath } from './serialize'
export { evalNumber, evalPredicate } from './eval'
export { predReadsTarget, exprReadsTarget } from './target'
export { replaceAt, type Path } from './edit'
