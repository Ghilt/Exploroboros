// Does a predicate / expression read the move DESTINATION anywhere? A leaf whose `@`-path includes a
// `target` segment reads the candidate destination (resolved per branch). The traverser DSL uses this
// to decide a move/directive guard is evaluated PER candidate move rather than once up front against the
// current tile. Pure — no traverse/walker import; it only walks the src/dsl AST.

import type { Expr, Pred, TilePath } from './types'

function pathHasTarget(path: TilePath | undefined): boolean {
  return !!path && path.some((s) => s.kind === 'target')
}

export function exprReadsTarget(expr: Expr): boolean {
  switch (expr.kind) {
    case 'number':
      return false
    case 'attr':
      return pathHasTarget(expr.path)
    case 'reg':
      return pathHasTarget(expr.path)
    case 'neg':
      return exprReadsTarget(expr.operand)
    case 'group':
      return exprReadsTarget(expr.inner)
    case 'bin':
      return exprReadsTarget(expr.left) || exprReadsTarget(expr.right)
  }
}

export function predReadsTarget(pred: Pred): boolean {
  switch (pred.kind) {
    case 'predref':
      return false // resolved to a target-free tree by resolvePredRefs before this ever runs
    case 'compare':
      return exprReadsTarget(pred.left) || exprReadsTarget(pred.right)
    case 'shape':
      return pathHasTarget(pred.path)
    case 'not':
      return predReadsTarget(pred.operand)
    case 'bool':
      return predReadsTarget(pred.left) || predReadsTarget(pred.right)
    case 'pgroup':
      return predReadsTarget(pred.inner)
  }
}
