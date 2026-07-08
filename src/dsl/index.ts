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
  RegTerm,
  Reducer,
  ListReduce,
  Expr,
  Compare,
  ShapeTest,
  Not,
  BoolBin,
  PredGroup,
  PredRef,
  ListNumCompare,
  ListShapeCompare,
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
export { predReadsTarget, exprReadsTarget, predFoundIndices, exprFoundIndices, predIsAbsolute, predPathReach } from './target'
export type { PathReach } from './target'
export { replaceAt, type Path } from './edit'
export { RESERVED_WORDS, reservedNameError } from './reserved'
export { sanitizeName, malformedNameError, VALID_NAME } from './names'
export { resolvePredRefs } from './resolveRefs'
