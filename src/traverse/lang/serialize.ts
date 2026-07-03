// Program -> canonical text. Round-trips through parseProgram, and serves as the auto-name for a
// definition (like the predicate DSL). Inner predicates/expressions reuse src/dsl's serializers.

import { serialize as serializePred, serializeExpr } from '../../dsl'
import { DEFAULT_SETTINGS } from './types'
import type {
  Action,
  AutoPlaceRule,
  Chain,
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
      return `e${r.index}`
  }
}

// One move chain as text (`edge 0`, `straight -> r1`) — the destination-naming part of a move, used
// by the debug trace to label a candidate.
export function serializeChain(c: Chain): string {
  return c.map(edgeRef).join(' -> ')
}

function target(t: EdgeTarget): string {
  const chains = t.map(serializeChain)
  return chains.length === 1 ? chains[0] : `[${chains.join(', ')}]`
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

export function serializeStmt(s: Stmt): string {
  switch (s.kind) {
    case 'reset':
      return 'reset directives'
    case 'directive':
      return `directive if ${serializeGuard(s.guard)} always ${s.allow ? 'allow' : 'forbid'} move`
    case 'rule':
      return s.guard ? `if ${serializeGuard(s.guard)} then ${action(s.action)}` : action(s.action)
  }
}

export function serializeAutoPlace(a: AutoPlaceRule): string {
  const base = `auto-place ${a.shape} {${a.spec.angle}, ${a.spec.percent}, ${a.spec.edge}}`
  return a.guard ? `${base} if ${serializeGuard(a.guard)}` : base
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
  return [
    ...settingLines(prog.settings),
    ...prog.placements.map(serializeAutoPlace),
    ...prog.statements.map(serializeStmt),
  ].join('\n')
}
