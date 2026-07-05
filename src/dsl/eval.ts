// Evaluate an AST against a tile. Pure and deterministic: reads only the EvalContext, no mutation,
// clock, or RNG, so the colorizer can cache results. Division and modulo by zero return 0 (rather
// than NaN/Infinity) so coloring always has a defined value and comparisons never go undefined.

import type { Expr, Pred, TilePath } from './types'
import type { EvalContext } from './attributes'
import { attrSpec } from './attributes'

// Resolve a leaf's optional `@`-path to the context it should be read against. No path → the current
// context. When the context supplies no resolver, or the path resolves to nothing (a relative hop in a
// walker-free context, a boundary, a missing tile) → null; the caller then yields the attribute's
// default / 0 / a false shape test.
function ctxForLeaf(ctx: EvalContext, path: TilePath | undefined): EvalContext | null {
  if (!path || path.length === 0) return ctx
  const node = ctx.nodeForPath?.(path)
  return node ? { ...ctx, node } : null
}

export function evalNumber(expr: Expr, ctx: EvalContext): number {
  switch (expr.kind) {
    case 'number':
      return expr.value
    case 'group':
      return evalNumber(expr.inner, ctx)
    case 'neg':
      return -evalNumber(expr.operand, ctx)
    case 'attr': {
      const sub = ctxForLeaf(ctx, expr.path)
      if (!sub) return expr.fallback ?? 0
      const spec = attrSpec(expr.name)
      const v = spec ? spec.compute(sub, expr.index) : undefined
      return v ?? expr.fallback ?? 0
    }
    case 'reg': {
      // [A] / [A, B] — sum the named tile registries (reuse the registry-x computes).
      const sub = ctxForLeaf(ctx, expr.path)
      if (!sub) return 0
      let sum = 0
      for (const r of expr.regs) {
        const spec = attrSpec(`registry-${r}`)
        sum += spec?.compute(sub) ?? 0
      }
      return sum
    }
    case 'bin': {
      const a = evalNumber(expr.left, ctx)
      const b = evalNumber(expr.right, ctx)
      switch (expr.op) {
        case '+':
          return a + b
        case '-':
          return a - b
        case '*':
          return a * b
        case '/':
          return b === 0 ? 0 : a / b
        case '%':
          return b === 0 ? 0 : a % b
      }
    }
  }
}

export function evalPredicate(pred: Pred, ctx: EvalContext): boolean {
  switch (pred.kind) {
    case 'predref':
      return false // resolvePredRefs inlines these before eval; defensive if one somehow slips through
    case 'pgroup':
      return evalPredicate(pred.inner, ctx)
    case 'shape': {
      // A missing target tile (unresolvable path) matches nothing → the test is false, either op
      // (mirrors the traverser rule that a boundary/missing tile makes the whole guard false).
      const sub = ctxForLeaf(ctx, pred.path)
      if (!sub) return false
      const matches = sub.node.shape === pred.shape
      return pred.op === '==' ? matches : !matches
    }
    case 'not':
      return !evalPredicate(pred.operand, ctx)
    case 'bool':
      return pred.op === 'and'
        ? evalPredicate(pred.left, ctx) && evalPredicate(pred.right, ctx)
        : evalPredicate(pred.left, ctx) || evalPredicate(pred.right, ctx)
    case 'compare': {
      const a = evalNumber(pred.left, ctx)
      const b = evalNumber(pred.right, ctx)
      switch (pred.op) {
        case '==':
          return a === b
        case '!=':
          return a !== b
        case '<':
          return a < b
        case '<=':
          return a <= b
        case '>':
          return a > b
        case '>=':
          return a >= b
      }
    }
  }
}
