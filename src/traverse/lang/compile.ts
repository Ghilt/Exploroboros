// Compile a definition's text into a runnable Program: parse it, then resolve every named-predicate
// reference — a whole bare-word guard (`if isCrowded then …`) AND any reference embedded inside a
// compound guard (`if isCrowded and Has_A then …`) — to an inline, ref-free predicate by looking each
// name up in the predicate library. After this, all guards are inline, so exec never sees a 'named'
// guard or a nested predref. Pure — the name->text map is the user's predicate library, passed in by
// the store.

import { parsePredicate, resolvePredRefs, type Result } from '../../dsl'
import { parseProgram } from './parse'
import type { Guard, Program, Stmt } from './types'

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

export function resolveNames(prog: Program, names: ReadonlyMap<string, string>): Result<Program> {
  const statements: Stmt[] = []
  for (const s of prog.statements) {
    if ((s.kind === 'rule' && s.guard) || s.kind === 'directive') {
      const guard = s.kind === 'rule' ? s.guard! : s.guard
      const r = resolveGuard(guard, names)
      if (!r.ok) return r
      statements.push({ ...s, guard: r.value })
    } else {
      statements.push(s)
    }
  }
  return { ok: true, value: { settings: prog.settings, statements } }
}

// Parse + resolve in one step — what the store uses to turn definition text into a Program.
export function compileProgram(text: string, names: ReadonlyMap<string, string>): Result<Program> {
  const parsed = parseProgram(text)
  if (!parsed.ok) return parsed
  return resolveNames(parsed.value, names)
}
