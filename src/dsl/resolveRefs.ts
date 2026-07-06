// Inline every named-predicate reference (`predref`) in a Pred tree into the referenced predicate's own
// AST, recursively — so `isCrowded and Has_A` becomes a plain, ref-free tree ready for evalPredicate.
// Pure: the caller supplies name -> DSL text (bundled + custom predicates); resolving is a one-time step
// per compile (coloring rule, traverser guard, …), not per-tile-eval — evalPredicate stays a total
// function with no registry of its own.
//
// A name that doesn't exist, or that resolves back into itself down the chain, is a compile-time error —
// never a silently-false predicate (a broken reference should be loud, not swallowed).

import type { Pred, Result, Span } from './types'
import { parsePredicate } from './parse'

const NO_SPAN: Span = { start: 0, end: 0 }

export function resolvePredRefs(
  pred: Pred,
  names: ReadonlyMap<string, string>,
  stack: ReadonlyArray<string> = [],
): Result<Pred> {
  switch (pred.kind) {
    case 'compare':
    case 'shape':
    case 'exists':
    // Lists hold Exprs, not nested Preds, so they can't contain a predref — return them unchanged.
    case 'listcmp':
    case 'shapecmp':
      return { ok: true, value: pred }
    case 'not': {
      const r = resolvePredRefs(pred.operand, names, stack)
      return r.ok ? { ok: true, value: { kind: 'not', operand: r.value } } : r
    }
    case 'pgroup': {
      const r = resolvePredRefs(pred.inner, names, stack)
      return r.ok ? { ok: true, value: { kind: 'pgroup', inner: r.value } } : r
    }
    case 'bool': {
      const l = resolvePredRefs(pred.left, names, stack)
      if (!l.ok) return l
      const r = resolvePredRefs(pred.right, names, stack)
      if (!r.ok) return r
      return { ok: true, value: { kind: 'bool', op: pred.op, left: l.value, right: r.value } }
    }
    case 'predref': {
      if (stack.includes(pred.name)) {
        return {
          ok: false,
          error: { message: `"${pred.name}" refers to itself (${[...stack, pred.name].join(' → ')})`, span: NO_SPAN },
        }
      }
      const text = names.get(pred.name)
      if (text === undefined) {
        return { ok: false, error: { message: `unknown predicate "${pred.name}"`, span: NO_SPAN } }
      }
      const parsed = parsePredicate(text)
      if (!parsed.ok) {
        return { ok: false, error: { message: `predicate "${pred.name}": ${parsed.error.message}`, span: NO_SPAN } }
      }
      return resolvePredRefs(parsed.value, names, [...stack, pred.name])
    }
  }
}
