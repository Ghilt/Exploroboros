// Compile a definition's text into a runnable Program: parse it, then resolve every named-predicate
// reference (`if isCrowded then …`) to an inline predicate by looking its DSL text up by name. After
// this, all guards are inline, so exec never sees a 'named' guard. Pure — the name->text map is the
// user's predicate library, passed in by the store.

import { parsePredicate, type Result } from '../../dsl'
import { parseProgram } from './parse'
import type { Guard, Program, Stmt } from './types'

function resolveGuard(guard: Guard, names: ReadonlyMap<string, string>): Result<Guard> {
  if (guard.pred.kind !== 'named') return { ok: true, value: guard }
  const text = names.get(guard.pred.name)
  if (text === undefined) {
    return { ok: false, error: { message: `unknown predicate "${guard.pred.name}"`, span: { start: 0, end: 0 } } }
  }
  const r = parsePredicate(text)
  if (!r.ok) {
    return {
      ok: false,
      error: { message: `predicate "${guard.pred.name}": ${r.error.message}`, span: { start: 0, end: 0 } },
    }
  }
  return { ok: true, value: { pred: { kind: 'inline', pred: r.value }, at: guard.at } }
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
