// Evaluate an AST against a tile. Pure and deterministic: reads only the EvalContext, no mutation,
// clock, or RNG, so the colorizer can cache results. Division and modulo by zero return 0 (rather
// than NaN/Infinity) so coloring always has a defined value and comparisons never go undefined.

import type { CompareOp, Expr, Pred, TilePath } from './types'
import type { EvalContext } from './attributes'
import { attrSpec } from './attributes'

function applyCompare(op: CompareOp, a: number, b: number): boolean {
  switch (op) {
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

// Combine per-element booleans by a list's boolean reducer: all = AND, any = OR, none = NOR, xor =
// EXACTLY one true (not parity).
function combineList(reducer: 'all' | 'any' | 'none' | 'xor', bools: ReadonlyArray<boolean>): boolean {
  switch (reducer) {
    case 'all':
      return bools.every(Boolean)
    case 'any':
      return bools.some(Boolean)
    case 'none':
      return !bools.some(Boolean)
    case 'xor':
      return bools.filter(Boolean).length === 1
  }
}

// Resolve a leaf's optional `.`-path to the context it should be read against. No path → the current
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
    case 'regterm': {
      // A registry A/B/C as a value (a list element), optionally read across an `.`-path.
      const sub = ctxForLeaf(ctx, expr.path)
      if (!sub) return 0
      const spec = attrSpec(`registry-${expr.reg}`)
      return spec?.compute(sub) ?? 0
    }
    case 'list': {
      // A numeric list reduced to one number: sum (default) / avg (rounds up) / min / max.
      const vals = expr.elems.map((e) => evalNumber(e, ctx))
      if (vals.length === 0) return 0
      switch (expr.reducer) {
        case 'sum':
          return vals.reduce((a, b) => a + b, 0)
        case 'avg':
          return Math.ceil(vals.reduce((a, b) => a + b, 0) / vals.length)
        case 'min':
          return Math.min(...vals)
        case 'max':
          return Math.max(...vals)
      }
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
    case 'exists':
      // The general "did this path resolve" test — the same resolution a reading attribute falls back
      // from, exposed directly so a resolved tile's own (possibly zero/false) values can't be confused
      // with the path not resolving at all.
      return ctxForLeaf(ctx, pred.path) !== null
    case 'not':
      return !evalPredicate(pred.operand, ctx)
    case 'bool':
      return pred.op === 'and'
        ? evalPredicate(pred.left, ctx) && evalPredicate(pred.right, ctx)
        : evalPredicate(pred.left, ctx) || evalPredicate(pred.right, ctx)
    case 'compare':
      return applyCompare(pred.op, evalNumber(pred.left, ctx), evalNumber(pred.right, ctx))
    case 'listcmp': {
      // Apply the comparison to each element against the (single) right value, then combine.
      const b = evalNumber(pred.right, ctx)
      return combineList(
        pred.reducer,
        pred.elems.map((e) => applyCompare(pred.op, evalNumber(e, ctx), b)),
      )
    }
    case 'shapecmp':
      // Each element is a tile-type read; a missing/off-grid tile matches nothing (false, either op).
      return combineList(
        pred.reducer,
        pred.paths.map((p) => {
          const sub = ctxForLeaf(ctx, p)
          if (!sub) return false
          const matches = sub.node.shape === pred.shape
          return pred.op === '==' ? matches : !matches
        }),
      )
  }
}
