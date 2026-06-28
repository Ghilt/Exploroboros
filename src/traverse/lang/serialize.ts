// Program -> canonical text. Round-trips through parseProgram, and serves as the auto-name for a
// definition (like the predicate DSL). Inner predicates/expressions reuse src/dsl's serializers.

import { serialize as serializePred, serializeExpr } from '../../dsl'
import { DEFAULT_SETTINGS } from './types'
import type {
  Action,
  Decoration,
  DExpr,
  EdgeRef,
  EdgeTarget,
  Guard,
  Program,
  Settings,
  Stmt,
} from './types'

function edgeRef(r: EdgeRef): string {
  switch (r.kind) {
    case 'straight':
      return 'straight'
    case 'unvisited':
      return 'nearest-unvisited'
    case 'turn':
      return `${r.dir}${r.n}`
    case 'edge':
      return `edge ${r.index}`
  }
}

function target(t: EdgeTarget): string {
  const chains = t.map((c) => c.map(edgeRef).join(' -> '))
  return chains.length === 1 ? chains[0] : `[${chains.join(', ')}]`
}

function decoration(d: Decoration): string {
  return d.kind === 'tile' ? ` @ tile ${d.index}` : ` @ ${edgeRef(d.edge)}`
}

function guard(g: Guard): string {
  const head = g.pred.kind === 'named' ? g.pred.name : serializePred(g.pred.pred)
  return head + (g.at ? decoration(g.at) : '')
}

function dexpr(d: DExpr): string {
  return serializeExpr(d.expr) + (d.at ? decoration(d.at) : '')
}

function isLiteralOne(d: DExpr): boolean {
  return !d.at && d.expr.kind === 'number' && d.expr.value === 1
}

function action(a: Action): string {
  switch (a.kind) {
    case 'move':
      return `move ${target(a.target)}`
    case 'morph':
      return `morph ${a.def} ${target(a.target)}`
    case 'put':
      return `put ${a.reg} = ${dexpr(a.value)}`
    case 'increase':
      return isLiteralOne(a.by) ? `increase ${a.reg}` : `increase ${a.reg} by ${dexpr(a.by)}`
    case 'update':
      return `update ${a.setting} ${a.value}`
  }
}

function stmt(s: Stmt): string {
  switch (s.kind) {
    case 'reset':
      return 'reset directives'
    case 'directive':
      return `directive move always ${s.allow ? 'allow' : 'forbid'} if ${guard(s.guard)}`
    case 'rule':
      return s.guard ? `if ${guard(s.guard)} then ${action(s.action)}` : action(s.action)
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
  return [...settingLines(prog.settings), ...prog.statements.map(stmt)].join('\n')
}
