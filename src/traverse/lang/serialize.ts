// Program -> canonical text. Round-trips through parseProgram, and serves as the auto-name for a
// definition (like the predicate DSL). Inner predicates/expressions reuse src/dsl's serializers.

import { serialize as serializePred, serializeExpr, serializePath, type EdgeAmount } from '../../dsl'
import { DEFAULT_SETTINGS } from './types'
import type { Action, Chain, DExpr, EdgeRef, EdgeTarget, FindMove, FindTile, Guard, Program, Settings, Stmt, WriteTarget } from './types'

// A numbered-reference amount: a literal verbatim, a computed expression in parens — `r2` / `r(steps % 2)`.
function amountStr(a: EdgeAmount): string {
  return typeof a === 'number' ? String(a) : `(${serializeExpr(a)})`
}

function edgeRef(r: EdgeRef): string {
  switch (r.kind) {
    case 'straight':
      return 'straight'
    case 'back':
      return 'back'
    case 'unvisited':
      return 'nearest-unvisited'
    case 'turn':
      return `${r.dir}${amountStr(r.n)}`
    case 'edge':
      return `e${amountStr(r.index)}`
  }
}

// One move chain as text: the edge hops joined by `.` (`e0.e4`, `straight.r1`), optionally rooted at a
// base tile — a found ref (`f0`, `f1.e0`) or an inline `find-tile … { … }`. `indent` is the current
// line's leading whitespace, so an inline find-tile's multi-line body lines up under it.
export function serializeChain(c: Chain, indent = ''): string {
  const refs = c.refs.map(edgeRef).join('.')
  if (!c.base) return refs
  const base =
    c.base.kind === 'found'
      ? `f${amountStr(c.base.index)}`
      : c.base.kind === 'tile'
        ? `t${amountStr(c.base.index)}`
        : findTileText(c.base.find, indent)
  return refs ? `${base}.${refs}` : base
}

function target(t: EdgeTarget, indent: string): string {
  const chains = t.map((c) => serializeChain(c, indent))
  return chains.length === 1 ? chains[0] : `[${chains.join(', ')}]`
}

function findMoveText(m: FindMove, indent: string): string {
  const mv = `move ${target(m.target, indent)}`
  return m.guard ? `if ${serializeGuard(m.guard)} then ${mv}` : mv
}

// `find-tile <pred> { … }` with its search moves one per indented line (round-trips through splitUnits).
// A non-default `max-split` leads the body as its own line.
function findTileText(find: FindTile, indent: string): string {
  const inner = `${indent}  `
  const lines = find.body.map((m) => `${inner}${findMoveText(m, inner)}`)
  if (find.maxSplit !== 1) lines.unshift(`${inner}max-split = ${find.maxSplit}`)
  return `find-tile ${serializeGuard(find.pred)} {\n${lines.join('\n')}\n${indent}}`
}

export function serializeGuard(g: Guard): string {
  return g.pred.kind === 'named' ? g.pred.name : serializePred(g.pred.pred)
}

function dexpr(d: DExpr): string {
  return serializeExpr(d.expr)
}

function isLiteralOne(d: DExpr): boolean {
  return d.expr.kind === 'number' && d.expr.value === 1
}

// One put/increase target back to text: a tile registry bare (`A` / `A.e1`, the canonical form now
// that `[…]` means a list) or a bare `P`/`Q`/`R` walker register. Exported so the trace can label each
// resolved element of a multi-target list.
export function serializeWriteTarget(t: WriteTarget): string {
  return t.kind === 'walker-reg' ? t.reg : `${t.reg.toUpperCase()}${serializePath(t.path)}`
}
function writeTargets(ts: ReadonlyArray<WriteTarget>): string {
  return ts.length === 1 ? serializeWriteTarget(ts[0]) : `[${ts.map(serializeWriteTarget).join(', ')}]`
}

function action(a: Action, indent: string): string {
  switch (a.kind) {
    case 'move':
      return `move ${target(a.target, indent)}`
    case 'morph':
      return `morph ${a.def} ${target(a.target, indent)}`
    case 'put':
      return `put ${writeTargets(a.target)} = ${dexpr(a.value)}`
    case 'increase':
      return isLiteralOne(a.by) ? `increase ${writeTargets(a.target)}` : `increase ${writeTargets(a.target)} by ${dexpr(a.by)}`
    case 'update':
      return `update ${a.setting} ${a.value}`
  }
}

export function serializeStmt(s: Stmt, indent = ''): string {
  switch (s.kind) {
    case 'reset':
      return 'reset directives'
    case 'directive':
      return `directive if ${serializeGuard(s.guard)} always ${s.allow ? 'allow' : 'forbid'} move`
    case 'rule':
      return s.guard ? `if ${serializeGuard(s.guard)} then ${action(s.action, indent)}` : action(s.action, indent)
    case 'if-block': {
      const inner = `${indent}  `
      const body = s.body.map((b) => `${inner}${serializeStmt(b, inner)}`).join('\n')
      let out = `if ${serializeGuard(s.guard)} {\n${body}\n${indent}}`
      if (s.elseBody) {
        // `else if` renders inline when the else is exactly one nested if-block; otherwise a plain block.
        if (s.elseBody.length === 1 && s.elseBody[0].kind === 'if-block') {
          out += ` else ${serializeStmt(s.elseBody[0], indent)}`
        } else {
          const elseBody = s.elseBody.map((b) => `${inner}${serializeStmt(b, inner)}`).join('\n')
          out += ` else {\n${elseBody}\n${indent}}`
        }
      }
      return out
    }
    case 'find-tile':
      return findTileText(s.find, indent)
    case 'find-extreme':
      return `find-${s.find.dir === 'low' ? 'lowest' : 'highest'}-tile ${serializeGuard(s.find.pred)}`
  }
}

function settingLines(s: Settings): string[] {
  const lines: string[] = []
  if (s.maxSplit !== DEFAULT_SETTINGS.maxSplit) lines.push(`max-split = ${s.maxSplit}`)
  if (s.heading !== undefined) lines.push(`heading = ${s.heading}`)
  if (s.movement !== DEFAULT_SETTINGS.movement) lines.push(`movement = ${s.movement}`)
  if (s.maxSteps !== DEFAULT_SETTINGS.maxSteps) lines.push(`max-steps = ${s.maxSteps}`)
  return lines
}

export function serializeProgram(prog: Program): string {
  return [...settingLines(prog.settings), ...prog.statements.map((s) => serializeStmt(s))].join('\n')
}
