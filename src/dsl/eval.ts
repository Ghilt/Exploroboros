// Evaluate an AST against a tile. Pure and deterministic: reads only the EvalContext, no mutation,
// clock, or RNG, so the colorizer can cache results. Division and modulo by zero return 0 (rather
// than NaN/Infinity) so coloring always has a defined value and comparisons never go undefined.

import type { Expr, Pred } from './types'
import type { EvalContext } from './attributes'
import { attrSpec } from './attributes'

export function evalNumber(expr: Expr, ctx: EvalContext): number {
  switch (expr.kind) {
    case 'number':
      return expr.value
    case 'group':
      return evalNumber(expr.inner, ctx)
    case 'neg':
      return -evalNumber(expr.operand, ctx)
    case 'attr': {
      const spec = attrSpec(expr.name)
      const v = spec ? spec.compute(ctx, expr.index) : undefined
      return v ?? expr.fallback ?? 0
    }
    case 'reg': {
      // [A] / [A, B] — sum the named tile registries (reuse the registry-x computes).
      let sum = 0
      for (const r of expr.regs) {
        const spec = attrSpec(`registry-${r}`)
        sum += spec?.compute(ctx) ?? 0
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
    case 'pgroup':
      return evalPredicate(pred.inner, ctx)
    case 'shape': {
      const matches = ctx.node.shape === pred.shape
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
