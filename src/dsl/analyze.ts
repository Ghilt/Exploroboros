// Static analysis over a predicate AST, separate from evaluation.

import type { Pred } from './types'

// The distinct shape names a predicate references via `tile-type == <shape>`. The Predicate pane
// compares these against the current tiling's shapes to flag predicates that mention a shape this
// tiling doesn't have (those checks simply won't match here).
export function referencedShapes(pred: Pred): string[] {
  const out = new Set<string>()
  const walk = (p: Pred): void => {
    switch (p.kind) {
      case 'shape':
        out.add(p.shape)
        return
      case 'not':
        walk(p.operand)
        return
      case 'bool':
        walk(p.left)
        walk(p.right)
        return
      case 'pgroup':
        walk(p.inner)
        return
      case 'compare':
        return
    }
  }
  walk(pred)
  return [...out]
}
