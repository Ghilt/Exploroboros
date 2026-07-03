// Recursive-descent parser for the traverser-program DSL. Statement-per-line: each line is a setting,
// a rule (`[if <guard> [@ <edge>] then] <action>`), a directive, or `reset directives`. Guards and
// formula values are sliced out as raw substrings and delegated to src/dsl's parsePredicate/parseExpr
// (their error spans offset back into the full source), so there is ONE expression/predicate language.
// Errors come back as a Result with a message + span, never thrown across the boundary.

import { parseExpr, parsePredicate, type Result, type Span } from '../../dsl'
import { lexProgram, type Tok } from './lex'
import {
  DEFAULT_SETTINGS,
  type Action,
  type AutoPlaceRule,
  type Chain,
  type DExpr,
  type EdgeRef,
  type EdgeTarget,
  type Guard,
  type Movement,
  type Program,
  type Reg,
  type SettingName,
  type Settings,
  type Stmt,
} from './types'

const REGS = new Set(['A', 'B', 'C', 'P', 'Q', 'R'])
const SETTING_NAMES = new Set<SettingName>(['max-split', 'heading', 'movement', 'max-steps'])

class ParseFail extends Error {
  readonly span: Span
  constructor(message: string, span: Span) {
    super(message)
    this.span = span
  }
}

// A cursor over one line's tokens (the `nl`/`eof` already stripped). Holds the source for slicing the
// raw substrings that get delegated to src/dsl.
class Line {
  pos = 0
  readonly toks: ReadonlyArray<Tok>
  readonly src: string
  constructor(toks: ReadonlyArray<Tok>, src: string) {
    this.toks = toks
    this.src = src
  }
  peek(): Tok | undefined {
    return this.toks[this.pos]
  }
  atEnd(): boolean {
    return this.pos >= this.toks.length
  }
  next(): Tok {
    const t = this.toks[this.pos]
    if (!t) throw new ParseFail('unexpected end of line', this.endSpan())
    this.pos += 1
    return t
  }
  endSpan(): Span {
    const last = this.toks[this.toks.length - 1]
    const at = last ? last.end : 0
    return { start: at, end: at }
  }
  spanHere(): Span {
    const t = this.peek()
    return t ? { start: t.start, end: t.end } : this.endSpan()
  }
  isWord(w: string): boolean {
    const t = this.peek()
    return !!t && t.kind === 'word' && t.text === w
  }
  isSym(s: string): boolean {
    const t = this.peek()
    return !!t && t.kind === 'sym' && t.text === s
  }
  word(message: string): Tok {
    const t = this.next()
    if (t.kind !== 'word') throw new ParseFail(message, { start: t.start, end: t.end })
    return t
  }
  expectWord(w: string): void {
    if (!this.isWord(w)) throw new ParseFail(`expected "${w}"`, this.spanHere())
    this.pos += 1
  }
  expectSym(s: string): void {
    if (!this.isSym(s)) throw new ParseFail(`expected "${s}"`, this.spanHere())
    this.pos += 1
  }
  expectEnd(): void {
    if (!this.atEnd()) throw new ParseFail(`unexpected "${this.peek()!.text}"`, this.spanHere())
  }
}

function offset(span: Span, by: number): Span {
  return { start: span.start + by, end: span.end + by }
}

// Slice tokens [from, to) back to raw text and delegate to a src/dsl parser, remapping error spans.
function delegate<T>(line: Line, from: number, to: number, what: 'pred' | 'expr'): T {
  if (to <= from) throw new ParseFail(`expected ${what === 'pred' ? 'a condition' : 'a value'}`, line.endSpan())
  const startOff = line.toks[from].start
  const sub = line.src.slice(startOff, line.toks[to - 1].end)
  const r: Result<unknown> = what === 'pred' ? parsePredicate(sub) : parseExpr(sub)
  if (!r.ok) throw new ParseFail(r.error.message, offset(r.error.span, startOff))
  return r.value as T
}

function parseEdgeRef(line: Line): EdgeRef {
  const t = line.word('expected an edge, e.g. straight, r1, l2, or e3')
  const text = t.text
  if (text === 'straight' || text === 's') return { kind: 'straight' }
  if (text === 'nearest-unvisited') return { kind: 'unvisited' }
  const turn = /^([rl])([0-9]+)$/.exec(text)
  if (turn) {
    const n = Number(turn[2])
    if (n < 1) throw new ParseFail('a turn must be r1/l1 or higher', { start: t.start, end: t.end })
    return { kind: 'turn', dir: turn[1] as 'r' | 'l', n }
  }
  const edge = /^e([0-9]+)$/.exec(text)
  if (edge) return { kind: 'edge', index: Number(edge[1]) }
  throw new ParseFail(`"${text}" is not an edge — use straight, r1/l1…, eN, or nearest-unvisited`, {
    start: t.start,
    end: t.end,
  })
}

function parseChain(line: Line): Chain {
  const refs: EdgeRef[] = [parseEdgeRef(line)]
  while (line.isSym('->')) {
    line.pos += 1
    refs.push(parseEdgeRef(line))
  }
  return refs
}

function parseEdgeTarget(line: Line): EdgeTarget {
  if (line.isSym('[')) {
    line.pos += 1
    const chains: Chain[] = [parseChain(line)]
    while (line.isSym(',')) {
      line.pos += 1
      chains.push(parseChain(line))
    }
    line.expectSym(']')
    return chains
  }
  return [parseChain(line)]
}

// A guard over tokens [from, to): a single-word named reference, or an inline predicate delegated whole
// to src/dsl. Any `@`-paths (`visited@e1`, `visited@target`) live INSIDE the predicate and are parsed by
// src/dsl — this layer no longer splits on `@`.
function parseGuardRange(line: Line, from: number, to: number): Guard {
  if (to - from === 1 && line.toks[from].kind === 'word') {
    return { pred: { kind: 'named', name: line.toks[from].text } }
  }
  return { pred: { kind: 'inline', pred: delegate(line, from, to, 'pred') } }
}

// A numeric value `<expr>` from the cursor to end of line (any `@`-paths inside are parsed by src/dsl).
function parseDExprToEnd(line: Line): DExpr {
  const from = line.pos
  const to = line.toks.length
  const expr = delegate<DExpr['expr']>(line, from, to, 'expr')
  line.pos = to
  return { expr }
}

function parseReg(line: Line): Reg {
  const t = line.word('expected a registry: A, B, C, P, Q or R')
  const up = t.text.toUpperCase()
  if (!REGS.has(up)) throw new ParseFail(`"${t.text}" is not a registry (A, B, C, P, Q, R)`, { start: t.start, end: t.end })
  return up as Reg
}

function parseAction(line: Line): Action {
  const head = line.word('expected an action: move, morph, put, increase or update')
  switch (head.text) {
    case 'move':
      return { kind: 'move', target: parseEdgeTarget(line) }
    case 'morph': {
      const def = line.word('expected a traverser name after "morph"')
      return { kind: 'morph', def: def.text, target: parseEdgeTarget(line) }
    }
    case 'put': {
      const reg = parseReg(line)
      line.expectSym('=')
      return { kind: 'put', reg, value: parseDExprToEnd(line) }
    }
    case 'increase': {
      const reg = parseReg(line)
      if (line.isWord('by')) {
        line.pos += 1
        return { kind: 'increase', reg, by: parseDExprToEnd(line) }
      }
      return { kind: 'increase', reg, by: { expr: { kind: 'number', value: 1 } } }
    }
    case 'update': {
      const name = line.word('expected a setting: max-split, heading, movement or max-steps').text
      if (!SETTING_NAMES.has(name as SettingName)) {
        throw new ParseFail(`"${name}" is not a setting`, line.endSpan())
      }
      const setting = name as SettingName
      const value = setting === 'movement' ? parseMovement(line) : parseNumberToken(line)
      return { kind: 'update', setting, value }
    }
    default:
      throw new ParseFail(`unknown action "${head.text}"`, { start: head.start, end: head.end })
  }
}

function parseMovement(line: Line): Movement {
  const t = line.word('expected "relative" or "absolute"')
  if (t.text !== 'relative' && t.text !== 'absolute') {
    throw new ParseFail('movement must be "relative" or "absolute"', { start: t.start, end: t.end })
  }
  return t.text
}

function parseNumberToken(line: Line): number {
  const t = line.next()
  const neg = t.kind === 'sym' && t.text === '-'
  const numTok = neg ? line.next() : t
  if (numTok.kind !== 'num') throw new ParseFail('expected a number', { start: numTok.start, end: numTok.end })
  return (neg ? -1 : 1) * Number(numTok.text)
}

// `auto-place line { <angle>, <percent>, <edge> } [if <guard>]` — a seed-placement rule (see types.ts).
// The `auto-place` word is already consumed. Each slot is a signed number; the optional guard runs to end
// of line and is delegated to src/dsl exactly like a directive's guard.
function parseAutoPlace(line: Line): AutoPlaceRule {
  const prim = line.word('expected "line" after "auto-place"')
  if (prim.text !== 'line') {
    throw new ParseFail(`unknown auto-place shape "${prim.text}" — use "line"`, { start: prim.start, end: prim.end })
  }
  line.expectSym('{')
  const angle = parseNumberToken(line)
  line.expectSym(',')
  const percent = parseNumberToken(line)
  line.expectSym(',')
  const edge = parseNumberToken(line)
  line.expectSym('}')
  let guard: Guard | undefined
  if (line.isWord('if')) {
    line.pos += 1
    const from = line.pos
    const to = line.toks.length
    guard = parseGuardRange(line, from, to)
    line.pos = to
  }
  line.expectEnd()
  return { shape: 'line', spec: { angle, percent, edge }, guard }
}

function parseSetting(line: Line, settings: Settings): void {
  const name = line.next().text as SettingName
  line.expectSym('=')
  if (name === 'movement') {
    settings.movement = parseMovement(line)
  } else {
    const value = parseNumberToken(line)
    if (name === 'max-split') settings.maxSplit = Math.max(0, Math.round(value))
    else if (name === 'max-steps') settings.maxSteps = Math.max(1, Math.round(value))
    else settings.heading = value
  }
  line.expectEnd()
}

function parseLine(line: Line, settings: Settings, statements: Stmt[], placements: AutoPlaceRule[]): void {
  const head = line.peek()
  if (!head || head.kind !== 'word') throw new ParseFail('expected a statement', line.spanHere())
  const w = head.text
  const second = line.toks[1]
  if (SETTING_NAMES.has(w as SettingName) && second && second.kind === 'sym' && second.text === '=') {
    parseSetting(line, settings)
    return
  }
  if (w === 'auto-place') {
    line.pos += 1
    placements.push(parseAutoPlace(line))
    return
  }
  if (w === 'directive') {
    // Grammar: `directive if <guard> always forbid|allow move`. The guard reads the current tile by
    // default; `@ target` in it redirects to the move's destination (see exec.ts).
    line.pos += 1
    line.expectWord('if')
    let alwaysIdx = -1
    for (let k = line.pos; k < line.toks.length; k += 1) {
      if (line.toks[k].kind === 'word' && line.toks[k].text === 'always') {
        alwaysIdx = k
        break
      }
    }
    if (alwaysIdx === -1) {
      throw new ParseFail('expected "always forbid move" / "always allow move" after the predicate', line.endSpan())
    }
    const guard = parseGuardRange(line, line.pos, alwaysIdx)
    line.pos = alwaysIdx
    line.expectWord('always')
    const t = line.word('expected "allow" or "forbid"')
    if (t.text !== 'allow' && t.text !== 'forbid') {
      throw new ParseFail('expected "allow" or "forbid"', { start: t.start, end: t.end })
    }
    line.expectWord('move')
    line.expectEnd()
    statements.push({ kind: 'directive', allow: t.text === 'allow', guard })
    return
  }
  if (w === 'reset') {
    line.pos += 1
    line.expectWord('directives')
    line.expectEnd()
    statements.push({ kind: 'reset' })
    return
  }
  if (w === 'if') {
    line.pos += 1
    let thenIdx = -1
    for (let k = line.pos; k < line.toks.length; k += 1) {
      if (line.toks[k].kind === 'word' && line.toks[k].text === 'then') {
        thenIdx = k
        break
      }
    }
    if (thenIdx === -1) throw new ParseFail('expected "then" after the condition', line.endSpan())
    const guard = parseGuardRange(line, line.pos, thenIdx)
    line.pos = thenIdx + 1
    const action = parseAction(line)
    line.expectEnd()
    statements.push({ kind: 'rule', guard, action })
    return
  }
  const action = parseAction(line)
  line.expectEnd()
  statements.push({ kind: 'rule', action })
}

export function parseProgram(src: string): Result<Program> {
  const lexed = lexProgram(src)
  if (!lexed.ok) return lexed
  const toks = lexed.value
  const settings: Settings = { ...DEFAULT_SETTINGS }
  const statements: Stmt[] = []
  const placements: AutoPlaceRule[] = []
  // Split into lines on the `nl` tokens (dropping the trailing `eof`).
  let lineToks: Tok[] = []
  try {
    for (const t of toks) {
      if (t.kind === 'eof' || t.kind === 'nl') {
        if (lineToks.length > 0) parseLine(new Line(lineToks, src), settings, statements, placements)
        lineToks = []
      } else {
        lineToks.push(t)
      }
    }
  } catch (e) {
    if (e instanceof ParseFail) return { ok: false, error: { message: e.message, span: e.span } }
    throw e
  }
  return { ok: true, value: { settings, statements, placements } }
}
