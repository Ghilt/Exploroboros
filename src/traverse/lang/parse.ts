// Recursive-descent parser for the traverser-program DSL. Statement-per-line: each line is a setting,
// a rule (`[if <guard> [@ <edge>] then] <action>`), a directive, or `reset directives`. Guards and
// formula values are sliced out as raw substrings and delegated to src/dsl's parsePredicate/parseExpr
// (their error spans offset back into the full source), so there is ONE expression/predicate language.
// Errors come back as a Result with a message + span, never thrown across the boundary.

import { exprFoundIndices, parseExpr, parsePredicate, predFoundIndices, type Expr, type Result, type Span } from '../../dsl'
import { lexProgram, type Tok } from './lex'
import {
  DEFAULT_SETTINGS,
  type Action,
  type Chain,
  type ChainBase,
  type DExpr,
  type EdgeRef,
  type EdgeTarget,
  type FindMove,
  type FindTile,
  type Guard,
  type Movement,
  type Program,
  type SettingName,
  type Settings,
  type Stmt,
  type WriteTarget,
} from './types'

// Threaded through the parse so every `find-tile` occurrence (a statement OR an inline move base) gets a
// stable source-position index — the `fN` a later statement references.
type ParseCtx = { findCount: number }

const WALKER_REGS = new Set(['P', 'Q', 'R'])
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

// A move-chain BASE, if one is present: an inline `find-tile … {…}` run here, or a found-tile ref `fN`.
// Consumes the base tokens if present; otherwise leaves the cursor untouched (the chain hops from the
// walker's current tile). `fN` can only ever be a base (an edge ref is never `fN`), so `e0@f1` fails
// naturally in parseEdgeRef.
function parseChainBase(line: Line, ctx: ParseCtx): ChainBase | undefined {
  if (line.isWord('find-tile')) return { kind: 'find', find: parseFindTile(line, ctx) }
  const t = line.peek()
  if (t && t.kind === 'word') {
    const m = /^f([0-9]+)$/.exec(t.text)
    if (m) {
      line.pos += 1
      return { kind: 'found', index: Number(m[1]) }
    }
  }
  return undefined
}

// One move chain: an optional base tile, then edge hops joined by `@` (`e0@e4`, `straight@r1`, `f1@e0`).
// A base-less chain needs at least one edge (`move e0`); a based chain may be bare (`move f0`).
function parseMoveChain(line: Line, ctx: ParseCtx): Chain {
  const base = parseChainBase(line, ctx)
  const refs: EdgeRef[] = []
  if (!base) refs.push(parseEdgeRef(line))
  while (line.isSym('@')) {
    line.pos += 1
    refs.push(parseEdgeRef(line))
  }
  return { base, refs }
}

// Expand an inclusive edge/turn range (`e1..e3`, `e1..3`, `r1..r4`) into one single-hop chain per step.
// Only edges (`eN`) and turns (`rN`/`lN`) range; the end may repeat the prefix or be a bare number but
// must stay the same kind. Called with the range's start ref already parsed and the `..` about to be read.
function expandRange(line: Line, first: EdgeRef): Chain[] {
  if (first.kind !== 'edge' && first.kind !== 'turn') {
    throw new ParseFail('a range must be over edges or turns, e.g. e1..e3 or r1..r4', line.spanHere())
  }
  const start = first.kind === 'edge' ? first.index : first.n
  let end: number
  const t = line.peek()
  if (t && t.kind === 'num') {
    line.pos += 1
    end = Number(t.text)
  } else {
    const endRef = parseEdgeRef(line)
    if (endRef.kind !== first.kind || (endRef.kind === 'turn' && first.kind === 'turn' && endRef.dir !== first.dir)) {
      throw new ParseFail('a range must stay the same kind, e.g. e1..e3 or r1..r4', line.spanHere())
    }
    end = endRef.kind === 'edge' ? endRef.index : endRef.n
  }
  if (end < start) throw new ParseFail('a range must ascend, e.g. e1..e3', line.spanHere())
  const chains: Chain[] = []
  for (let i = start; i <= end; i += 1) {
    chains.push({ refs: [first.kind === 'edge' ? { kind: 'edge', index: i } : { kind: 'turn', dir: first.dir, n: i }] })
  }
  return chains
}

// One item inside a move `[…]`: a based chain (`f1@e0`), a range (`e1..e3`) expanding to several
// single-hop chains, or an edge chain (`straight`, `e0@e4`). Appends the resulting chain(s) to `out`.
function parseEdgeItem(line: Line, out: Chain[], ctx: ParseCtx): void {
  const base = parseChainBase(line, ctx)
  if (base) {
    const refs: EdgeRef[] = []
    while (line.isSym('@')) {
      line.pos += 1
      refs.push(parseEdgeRef(line))
    }
    out.push({ base, refs })
    return
  }
  const first = parseEdgeRef(line)
  if (line.isSym('..')) {
    line.pos += 1
    out.push(...expandRange(line, first))
    return
  }
  const refs: EdgeRef[] = [first]
  while (line.isSym('@')) {
    line.pos += 1
    refs.push(parseEdgeRef(line))
  }
  out.push({ refs })
}

function parseEdgeTarget(line: Line, ctx: ParseCtx): EdgeTarget {
  if (line.isSym('[')) {
    line.pos += 1
    const chains: Chain[] = []
    for (;;) {
      parseEdgeItem(line, chains, ctx)
      if (line.isSym(',')) {
        line.pos += 1
        continue
      }
      break
    }
    line.expectSym(']')
    // A move target is an OUTPUT list — no `:reducer` (modifiers are for conditions / put values).
    if (line.isSym(':')) throw new ParseFail('a move target takes no reducer — modifiers are for conditions', line.spanHere())
    return chains
  }
  return [parseMoveChain(line, ctx)]
}

// A guard over tokens [from, to): a single-word named reference, or an inline predicate delegated whole
// to src/dsl. A COMPOUND guard that references saved predicates by name (`isCrowded and hasC`) is not a
// single token, so it delegates to src/dsl, which parses the bare names as predrefs; compile-time
// resolveNames then inlines both the single-word and the embedded references. Any `@`-paths
// (`visited@e1`, `visited@target`) live INSIDE the predicate and are parsed by src/dsl.
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

// The write target(s) of a put/increase (mirrors how registries are read in a formula):
//  - `A` / `A@e1` — a single tile registry, bare, with an optional `@`-path to write a neighbour.
//  - `[A]` / `[A@e1]` / `[A, B]` — the same in brackets; `[A, B]` writes BOTH (each gets the same value).
//    The whole bracket is delegated to src/dsl (parseExpr → a list) so the `@`-path grammar is shared; a
//    reducer or a non-registry element errors.
//  - `P` / `Q` / `R` — the walker's own register, bare (single; no path — walker state isn't per-tile).
function parseWriteTargets(line: Line): WriteTarget[] {
  if (line.isSym('[')) {
    const open = line.pos
    let close = -1
    for (let k = open + 1; k < line.toks.length; k += 1) {
      const t = line.toks[k]
      if (t.kind === 'sym' && t.text === ']') {
        close = k
        break
      }
    }
    if (close === -1) throw new ParseFail('expected "]" to close the registry, e.g. [A]', line.spanHere())
    const expr = delegate<Expr>(line, open, close + 1, 'expr')
    const span = { start: line.toks[open].start, end: line.toks[close].end }
    line.pos = close + 1
    if (expr.kind !== 'list' || expr.reducer !== 'sum') {
      throw new ParseFail('write target must be registries, e.g. [A] or [A, B]', span)
    }
    const targets: WriteTarget[] = []
    for (const el of expr.elems) {
      if (el.kind !== 'regterm') throw new ParseFail('write targets must be registries A/B/C, e.g. [A, B]', span)
      targets.push(el.path ? { kind: 'tile-reg', reg: el.reg, path: el.path } : { kind: 'tile-reg', reg: el.reg })
    }
    return targets
  }
  const t = line.word('expected a registry: A, B, C, or P, Q, R')
  const up = t.text.toUpperCase()
  if (WALKER_REGS.has(up)) return [{ kind: 'walker-reg', reg: up as 'P' | 'Q' | 'R' }]
  if (up === 'A' || up === 'B' || up === 'C') {
    // A bare tile registry, with an optional `@`-path to write a neighbour. Consume the `A@…` run and
    // delegate it to src/dsl so the path grammar stays shared, then read back the single regterm.
    const from = line.pos - 1
    while (line.isSym('@')) {
      line.pos += 1
      const seg = line.word('expected an edge after "@", e.g. A@e1')
      if (seg.text === 'tile') line.next() // `@tile N` also takes a number
    }
    const expr = delegate<Expr>(line, from, line.pos, 'expr')
    if (expr.kind !== 'regterm') {
      throw new ParseFail('write target must be a registry A/B/C (optionally with an @path)', { start: t.start, end: t.end })
    }
    return [expr.path ? { kind: 'tile-reg', reg: expr.reg, path: expr.path } : { kind: 'tile-reg', reg: expr.reg }]
  }
  throw new ParseFail(`"${t.text}" is not a registry — use A, B, C or P, Q, R`, { start: t.start, end: t.end })
}

function parseAction(line: Line, ctx: ParseCtx): Action {
  const head = line.word('expected an action: move, morph, put, increase or update')
  switch (head.text) {
    case 'move':
      return { kind: 'move', target: parseEdgeTarget(line, ctx) }
    case 'morph': {
      const def = line.word('expected a traverser name after "morph"')
      return { kind: 'morph', def: def.text, target: parseEdgeTarget(line, ctx) }
    }
    case 'put': {
      const target = parseWriteTargets(line)
      line.expectSym('=')
      return { kind: 'put', target, value: parseDExprToEnd(line) }
    }
    case 'increase': {
      const target = parseWriteTargets(line)
      if (line.isWord('by')) {
        line.pos += 1
        return { kind: 'increase', target, by: parseDExprToEnd(line) }
      }
      return { kind: 'increase', target, by: { expr: { kind: 'number', value: 1 } } }
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

// The index of the `}` matching the `{` at `openIdx`, or -1 if unbalanced.
function matchBrace(toks: ReadonlyArray<Tok>, openIdx: number): number {
  let depth = 0
  for (let k = openIdx; k < toks.length; k += 1) {
    const t = toks[k]
    if (t.kind === 'sym' && t.text === '{') depth += 1
    else if (t.kind === 'sym' && t.text === '}') {
      depth -= 1
      if (depth === 0) return k
    }
  }
  return -1
}

// Split a token slice into statement UNITS: a newline at brace-depth 0 ends a unit, but newlines inside a
// `{ … }` body stay in the unit (the body is re-split when it's parsed). Drops the trailing `eof`. This
// is what lets `if <pred> { … }` / `find-tile <pred> { … }` span several physical lines yet parse as one.
function splitUnits(toks: ReadonlyArray<Tok>): Tok[][] {
  const units: Tok[][] = []
  let cur: Tok[] = []
  let depth = 0
  for (const t of toks) {
    if (t.kind === 'eof') break
    if (t.kind === 'nl') {
      if (depth === 0) {
        if (cur.length) units.push(cur)
        cur = []
      } else cur.push(t)
      continue
    }
    if (t.kind === 'sym' && t.text === '{') depth += 1
    else if (t.kind === 'sym' && t.text === '}') depth = Math.max(0, depth - 1)
    cur.push(t)
  }
  if (cur.length) units.push(cur)
  return units
}

// Index of the first top-level `{` from the cursor, or -1. (Predicates never contain `{`, so the first
// brace always opens the block body.)
function findBraceIdx(line: Line): number {
  for (let k = line.pos; k < line.toks.length; k += 1) {
    if (line.toks[k].kind === 'sym' && line.toks[k].text === '{') return k
  }
  return -1
}

// `find-tile <predicate> { <search moves> }` — the cursor is on the `find-tile` word; consumes through
// the closing `}`. Each occurrence takes the next source-position index (its `fN`), assigned up front so
// nested/sibling finds number in reading order.
function parseFindTile(line: Line, ctx: ParseCtx): FindTile {
  line.expectWord('find-tile')
  const index = ctx.findCount
  ctx.findCount += 1
  const braceIdx = findBraceIdx(line)
  if (braceIdx === -1) throw new ParseFail('expected "{ … }" with the search moves after the find-tile condition', line.endSpan())
  if (braceIdx === line.pos) {
    throw new ParseFail('find-tile needs a condition before "{", e.g. find-tile A == 5 { move nearest-unvisited }', line.spanHere())
  }
  const pred = parseGuardRange(line, line.pos, braceIdx)
  const close = matchBrace(line.toks, braceIdx)
  if (close === -1) throw new ParseFail('expected "}" to close the find-tile block', line.endSpan())
  const body: FindMove[] = []
  for (const unit of splitUnits(line.toks.slice(braceIdx + 1, close))) body.push(parseFindMove(new Line(unit, line.src), ctx))
  if (body.length === 0) throw new ParseFail('a find-tile block needs at least one move to search with, e.g. { move nearest-unvisited }', line.spanHere())
  line.pos = close + 1
  return { index, pred, body }
}

// One move inside a find-tile body: `move <target>` or `if <guard> then move <target>`. These are the
// search's expansion rule (ghost moves), so they hop from each frontier tile — a base (fN / inline
// find-tile) is meaningless here and rejected.
function parseFindMove(line: Line, ctx: ParseCtx): FindMove {
  const head = line.peek()
  if (!head || head.kind !== 'word') throw new ParseFail('a find-tile block may only contain move commands, e.g. move straight', line.spanHere())
  let guard: Guard | undefined
  if (head.text === 'if') {
    line.pos += 1
    let thenIdx = -1
    for (let k = line.pos; k < line.toks.length; k += 1) {
      if (line.toks[k].kind === 'word' && line.toks[k].text === 'then') {
        thenIdx = k
        break
      }
    }
    if (thenIdx === -1) throw new ParseFail('a guarded search move needs "then move …", e.g. if visited == 0 then move straight', line.endSpan())
    guard = parseGuardRange(line, line.pos, thenIdx)
    line.pos = thenIdx + 1
  }
  if (!line.isWord('move')) {
    throw new ParseFail('a find-tile block may only contain move commands (optionally guarded with "if … then move")', line.spanHere())
  }
  line.pos += 1
  const target = parseEdgeTarget(line, ctx)
  for (const c of target) {
    if (c.base) throw new ParseFail("a find-tile search move hops from each tile it reaches — it can't use fN or a nested find-tile", line.spanHere())
  }
  line.expectEnd()
  return guard ? { guard, target } : { target }
}

// Parse the statements inside an if-block's braces. Header settings can't appear here (passed a null
// settings sink), so `max-split` etc. inside a block report a clear error.
function parseBlockBody(bodyToks: ReadonlyArray<Tok>, src: string, ctx: ParseCtx): Stmt[] {
  const stmts: Stmt[] = []
  for (const unit of splitUnits(bodyToks)) parseLine(new Line(unit, src), null, stmts, ctx)
  return stmts
}

function parseLine(line: Line, settings: Settings | null, statements: Stmt[], ctx: ParseCtx): void {
  const head = line.peek()
  if (!head || head.kind !== 'word') throw new ParseFail('expected a statement', line.spanHere())
  const w = head.text
  const second = line.toks[1]
  if (SETTING_NAMES.has(w as SettingName) && second && second.kind === 'sym' && second.text === '=') {
    if (!settings) {
      throw new ParseFail(`"${w}" is a header setting — it belongs at the top of the definition, not inside a block`, { start: head.start, end: head.end })
    }
    parseSetting(line, settings)
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
  if (w === 'find-tile') {
    const find = parseFindTile(line, ctx)
    line.expectEnd()
    statements.push({ kind: 'find-tile', find })
    return
  }
  if (w === 'if') {
    line.pos += 1
    // The first top-level `then` or `{` decides single-line rule (`if X then …`) vs block (`if X { … }`).
    let thenIdx = -1
    let braceIdx = -1
    for (let k = line.pos; k < line.toks.length; k += 1) {
      const t = line.toks[k]
      if (t.kind === 'sym' && t.text === '{') {
        braceIdx = k
        break
      }
      if (t.kind === 'word' && t.text === 'then') {
        thenIdx = k
        break
      }
    }
    if (braceIdx !== -1) {
      const guard = parseGuardRange(line, line.pos, braceIdx)
      const close = matchBrace(line.toks, braceIdx)
      if (close === -1) throw new ParseFail('expected "}" to close the if-block', line.endSpan())
      const body = parseBlockBody(line.toks.slice(braceIdx + 1, close), line.src, ctx)
      line.pos = close + 1
      line.expectEnd()
      statements.push({ kind: 'if-block', guard, body })
      return
    }
    if (thenIdx === -1) throw new ParseFail('expected "then <action>" or "{ … }" after the condition', line.endSpan())
    const guard = parseGuardRange(line, line.pos, thenIdx)
    line.pos = thenIdx + 1
    const action = parseAction(line, ctx)
    line.expectEnd()
    statements.push({ kind: 'rule', guard, action })
    return
  }
  const action = parseAction(line, ctx)
  line.expectEnd()
  statements.push({ kind: 'rule', action })
}

// After parsing, gather every `fN` the program references (move bases + inline `@fN` paths in guards /
// values / write targets) so parseProgram can reject a reference to a find-tile that doesn't exist.
function pathFoundInto(path: ReadonlyArray<{ kind: string; index?: number }> | undefined, out: number[]): void {
  if (path) for (const s of path) if (s.kind === 'found' && s.index !== undefined) out.push(s.index)
}
function guardFoundRefs(g: Guard | undefined, out: number[]): void {
  if (g && g.pred.kind === 'inline') predFoundIndices(g.pred.pred, out)
}
function targetFoundRefs(target: EdgeTarget, out: number[]): void {
  for (const c of target) {
    if (c.base?.kind === 'found') out.push(c.base.index)
    else if (c.base?.kind === 'find') findFoundRefs(c.base.find, out)
  }
}
function findFoundRefs(find: FindTile, out: number[]): void {
  guardFoundRefs(find.pred, out)
  for (const m of find.body) {
    guardFoundRefs(m.guard, out)
    targetFoundRefs(m.target, out)
  }
}
function actionFoundRefs(a: Action, out: number[]): void {
  if (a.kind === 'move' || a.kind === 'morph') targetFoundRefs(a.target, out)
  if (a.kind === 'put') exprFoundIndices(a.value.expr, out)
  if (a.kind === 'increase') exprFoundIndices(a.by.expr, out)
  if (a.kind === 'put' || a.kind === 'increase') for (const t of a.target) if (t.kind === 'tile-reg') pathFoundInto(t.path, out)
}
function stmtFoundRefs(s: Stmt, out: number[]): void {
  switch (s.kind) {
    case 'rule':
      guardFoundRefs(s.guard, out)
      actionFoundRefs(s.action, out)
      break
    case 'directive':
      guardFoundRefs(s.guard, out)
      break
    case 'if-block':
      guardFoundRefs(s.guard, out)
      s.body.forEach((b) => stmtFoundRefs(b, out))
      break
    case 'find-tile':
      findFoundRefs(s.find, out)
      break
    case 'reset':
      break
  }
}

export function parseProgram(src: string): Result<Program> {
  const lexed = lexProgram(src)
  if (!lexed.ok) return lexed
  const settings: Settings = { ...DEFAULT_SETTINGS }
  const statements: Stmt[] = []
  const ctx: ParseCtx = { findCount: 0 }
  try {
    for (const unit of splitUnits(lexed.value)) parseLine(new Line(unit, src), settings, statements, ctx)
    const refs: number[] = []
    statements.forEach((s) => stmtFoundRefs(s, refs))
    const bad = refs.find((i) => i >= ctx.findCount)
    if (bad !== undefined) {
      const have = ctx.findCount
      const msg =
        have === 0
          ? `"f${bad}" refers to a find-tile, but this definition has none — add a "find-tile … { … }" block first`
          : `"f${bad}" refers to find-tile #${bad}, but this definition only has ${have} (f0${have > 1 ? `…f${have - 1}` : ''})`
      return { ok: false, error: { message: msg, span: { start: 0, end: 0 } } }
    }
  } catch (e) {
    if (e instanceof ParseFail) return { ok: false, error: { message: e.message, span: e.span } }
    throw e
  }
  return { ok: true, value: { settings, statements } }
}
