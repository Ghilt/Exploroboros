// Compile a document's text into a runnable Doc: parse it, then resolve every named-predicate
// reference — a whole bare-word guard (`… if isOct`) AND any reference embedded inside a compound guard
// (`… if isOct and hasA`) — to an inline, ref-free predicate by looking each name up. After this all
// guards are inline, so the resolver never sees a 'named' guard or a nested predref. Pure — the
// name->text map is the user's predicate library, passed in by the store. Mirrors the traverser DSL's
// compile.

import { parsePredicate, resolvePredRefs, type Result } from '../dsl'
import { parseDoc } from './parse'
import type { Doc, Guard, InitStmt } from './types'

function resolveGuard(guard: Guard, names: ReadonlyMap<string, string>): Result<Guard> {
  if (guard.pred.kind === 'named') {
    const text = names.get(guard.pred.name)
    if (text === undefined) {
      return { ok: false, error: { message: `unknown predicate "${guard.pred.name}"`, span: { start: 0, end: 0 } } }
    }
    const parsed = parsePredicate(text)
    if (!parsed.ok) {
      return {
        ok: false,
        error: { message: `predicate "${guard.pred.name}": ${parsed.error.message}`, span: { start: 0, end: 0 } },
      }
    }
    const resolved = resolvePredRefs(parsed.value, names, [guard.pred.name])
    return resolved.ok ? { ok: true, value: { pred: { kind: 'inline', pred: resolved.value } } } : resolved
  }
  const resolved = resolvePredRefs(guard.pred.pred, names)
  return resolved.ok ? { ok: true, value: { pred: { kind: 'inline', pred: resolved.value } } } : resolved
}

export function resolveNames(doc: Doc, names: ReadonlyMap<string, string>): Result<Doc> {
  const out: InitStmt[] = []
  for (const s of doc) {
    if (!s.guard) {
      out.push(s)
      continue
    }
    const r = resolveGuard(s.guard, names)
    if (!r.ok) return r
    out.push({ ...s, guard: r.value })
  }
  return { ok: true, value: out }
}

// Parse + resolve in one step — what the pane/export use to turn document text into a runnable Doc.
export function compileDoc(text: string, names: ReadonlyMap<string, string>): Result<Doc> {
  const parsed = parseDoc(text)
  if (!parsed.ok) return parsed
  return resolveNames(parsed.value, names)
}
