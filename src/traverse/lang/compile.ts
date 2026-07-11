// Compile a definition's text into a runnable Program: parse it, then resolve every named-predicate
// reference — a whole bare-word guard (`if isCrowded then …`) AND any reference embedded inside a
// compound guard (`if isCrowded and Has_A then …`) — to an inline, ref-free predicate by looking each
// name up in the predicate library. After this, all guards are inline, so exec never sees a 'named'
// guard or a nested predref. Pure — the name->text map is the user's predicate library, passed in by
// the store.

import { parsePredicate, predIsAbsolute, resolvePredRefs, type Result } from '../../dsl'
import { parseProgram } from './parse'
import type { Action, EdgeTarget, FindExtreme, FindMove, FindTile, Guard, Program, Stmt } from './types'

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

// A find-tile carries a goal predicate + guarded body moves — all of which may name saved predicates, so
// resolve them too (recursively, since a body move could hold... only edge chains, but its guard can).
function resolveFind(find: FindTile, names: ReadonlyMap<string, string>): Result<FindTile> {
  const pred = resolveGuard(find.pred, names)
  if (!pred.ok) return pred
  const body: FindMove[] = []
  for (const m of find.body) {
    if (m.guard) {
      const r = resolveGuard(m.guard, names)
      if (!r.ok) return r
      body.push({ guard: r.value, target: m.target })
    } else body.push(m)
  }
  return { ok: true, value: { index: find.index, pred: pred.value, maxSplit: find.maxSplit, body } }
}

// find-lowest/highest-tile: resolve its named predicate to inline, then ENFORCE that it's walker-free —
// a pure function of (tile, overlay). The global scan has no walker, and the per-query bookmark cache
// only stays correct + shareable if the answer can't depend on a walker's heading/steps/registers or a
// relative/target/found path. A violation is a compile error so it surfaces in the editor.
function resolveFindExtreme(find: FindExtreme, names: ReadonlyMap<string, string>): Result<FindExtreme> {
  const pred = resolveGuard(find.pred, names)
  if (!pred.ok) return pred
  if (pred.value.pred.kind === 'inline' && !predIsAbsolute(pred.value.pred.pred)) {
    return {
      ok: false,
      error: {
        message: `find-${find.dir === 'low' ? 'lowest' : 'highest'}-tile searches every tile, so its condition can only read the tile itself and absolute neighbours (visited, [A], visited.e0, tile-type == …) — not the walker's heading/steps/P/Q/R or relative directions (straight, r1, .target)`,
        span: { start: 0, end: 0 },
      },
    }
  }
  return { ok: true, value: { ...find, pred: pred.value } }
}

// A move/morph target may hold an INLINE find-tile as a chain base — resolve its guards in place.
function resolveTarget(target: EdgeTarget, names: ReadonlyMap<string, string>): Result<EdgeTarget> {
  const out = []
  for (const c of target) {
    if (c.base?.kind === 'find') {
      const r = resolveFind(c.base.find, names)
      if (!r.ok) return r
      out.push({ base: { kind: 'find' as const, find: r.value }, refs: c.refs })
    } else out.push(c)
  }
  return { ok: true, value: out }
}

function resolveAction(a: Action, names: ReadonlyMap<string, string>): Result<Action> {
  if (a.kind === 'move' || a.kind === 'morph') {
    const r = resolveTarget(a.target, names)
    return r.ok ? { ok: true, value: { ...a, target: r.value } } : r
  }
  return { ok: true, value: a }
}

function resolveStmt(s: Stmt, names: ReadonlyMap<string, string>): Result<Stmt> {
  switch (s.kind) {
    case 'reset':
      return { ok: true, value: s }
    case 'directive': {
      const r = resolveGuard(s.guard, names)
      return r.ok ? { ok: true, value: { ...s, guard: r.value } } : r
    }
    case 'rule': {
      let guard = s.guard
      if (guard) {
        const r = resolveGuard(guard, names)
        if (!r.ok) return r
        guard = r.value
      }
      const a = resolveAction(s.action, names)
      if (!a.ok) return a
      return { ok: true, value: guard ? { kind: 'rule', guard, action: a.value } : { kind: 'rule', action: a.value } }
    }
    case 'if-block': {
      const g = resolveGuard(s.guard, names)
      if (!g.ok) return g
      const body = resolveStmtList(s.body, names)
      if (!body.ok) return body
      if (s.elseBody === undefined) {
        return { ok: true, value: { kind: 'if-block', guard: g.value, body: body.value } }
      }
      const elseBody = resolveStmtList(s.elseBody, names)
      if (!elseBody.ok) return elseBody
      return { ok: true, value: { kind: 'if-block', guard: g.value, body: body.value, elseBody: elseBody.value } }
    }
    case 'find-tile': {
      const r = resolveFind(s.find, names)
      return r.ok ? { ok: true, value: { kind: 'find-tile', find: r.value } } : r
    }
    case 'find-extreme': {
      const r = resolveFindExtreme(s.find, names)
      return r.ok ? { ok: true, value: { kind: 'find-extreme', find: r.value } } : r
    }
  }
}

// Resolve every statement in a list (a program's top level, or an if-block's body / else branch). Kept
// as one helper so a nested branch can never be forgotten — every statement holder routes through here.
function resolveStmtList(stmts: ReadonlyArray<Stmt>, names: ReadonlyMap<string, string>): Result<Stmt[]> {
  const out: Stmt[] = []
  for (const s of stmts) {
    const r = resolveStmt(s, names)
    if (!r.ok) return r
    out.push(r.value)
  }
  return { ok: true, value: out }
}

export function resolveNames(prog: Program, names: ReadonlyMap<string, string>): Result<Program> {
  const statements = resolveStmtList(prog.statements, names)
  return statements.ok ? { ok: true, value: { settings: prog.settings, statements: statements.value } } : statements
}

// Parse + resolve in one step — what the store uses to turn definition text into a Program.
export function compileProgram(text: string, names: ReadonlyMap<string, string>): Result<Program> {
  const parsed = parseProgram(text)
  if (!parsed.ok) return parsed
  return resolveNames(parsed.value, names)
}
