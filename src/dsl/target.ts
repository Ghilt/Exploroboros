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
    case 'regterm':
      return pathHasTarget(expr.path)
    case 'list':
      return expr.elems.some(exprReadsTarget)
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
    case 'exists':
      return pathHasTarget(pred.path)
    case 'listcmp':
      return pred.elems.some(exprReadsTarget) || exprReadsTarget(pred.right)
    case 'shapecmp':
      return pred.paths.some(pathHasTarget)
    case 'not':
      return predReadsTarget(pred.operand)
    case 'bool':
      return predReadsTarget(pred.left) || predReadsTarget(pred.right)
    case 'pgroup':
      return predReadsTarget(pred.inner)
  }
}

// Collect the `found` (`@fN`) indices a predicate / expression reads, so the traverser compiler can
// reject a reference to a find-tile that doesn't exist (`move f2` with only two `find-tile` blocks).
// Same shallow AST walk as predReadsTarget; a `found` seg can only ever be a path's first hop.
function pathFoundIndices(path: TilePath | undefined, out: number[]): void {
  if (path) for (const s of path) if (s.kind === 'found') out.push(s.index)
}
export function exprFoundIndices(expr: Expr, out: number[] = []): number[] {
  switch (expr.kind) {
    case 'number':
      break
    case 'attr':
    case 'regterm':
      pathFoundIndices(expr.path, out)
      break
    case 'list':
      expr.elems.forEach((e) => exprFoundIndices(e, out))
      break
    case 'neg':
      exprFoundIndices(expr.operand, out)
      break
    case 'group':
      exprFoundIndices(expr.inner, out)
      break
    case 'bin':
      exprFoundIndices(expr.left, out)
      exprFoundIndices(expr.right, out)
      break
  }
  return out
}
export function predFoundIndices(pred: Pred, out: number[] = []): number[] {
  switch (pred.kind) {
    case 'predref':
      break
    case 'compare':
      exprFoundIndices(pred.left, out)
      exprFoundIndices(pred.right, out)
      break
    case 'shape':
      pathFoundIndices(pred.path, out)
      break
    case 'exists':
      pathFoundIndices(pred.path, out)
      break
    case 'listcmp':
      pred.elems.forEach((e) => exprFoundIndices(e, out))
      exprFoundIndices(pred.right, out)
      break
    case 'shapecmp':
      pred.paths.forEach((p) => pathFoundIndices(p, out))
      break
    case 'not':
      predFoundIndices(pred.operand, out)
      break
    case 'bool':
      predFoundIndices(pred.left, out)
      predFoundIndices(pred.right, out)
      break
    case 'pgroup':
      predFoundIndices(pred.inner, out)
      break
  }
  return out
}
