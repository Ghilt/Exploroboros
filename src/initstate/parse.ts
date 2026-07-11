// Recursive-descent parser for the Initial-state DSL. One statement per line:
//   auto-place line {what, angle, percent, param} [if <predicate>]
//   auto-place blob {what, x, y, radius, param} [if <predicate>]
// Reuses the traverser DSL's generic statement tokenizer (lexProgram — it already handles
// `{ } [ ] , . words numbers` and lumps predicate operators into `sym`) and delegates the `if`
// predicate whole to src/dsl. Errors come back as a Result with a message + span, never thrown across
// the boundary.

import { parsePredicate, type Result, type Span } from '../dsl'
import { lexProgram, type Tok } from '../traverse/lang/lex'
import type { Doc, Guard, InitStmt, Shape, What } from './types'

class ParseFail extends Error {
  readonly span: Span
  constructor(message: string, span: Span) {
    super(message)
    this.span = span
  }
}

// A cursor over one line's tokens (the `nl`/`eof` already stripped). Holds the source for slicing the
// raw substring handed to src/dsl for the guard.
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

// A signed number in a spec slot, and the punctuation between slots. On a mismatch these blame the whole
// shape TEMPLATE (so a short `blob {[A],50,100,1}` reports "blob takes {what, x%, y%, radius, param}"
// rather than a bare "expected ,") — the count/comma/brace mistakes are the confusing ones. A bad `what`
// token keeps its own specific message (parseWhat).
function specNumber(line: Line, help: string): number {
  const neg = line.isSym('-')
  const numTok = neg ? line.toks[line.pos + 1] : line.peek()
  if (!numTok || numTok.kind !== 'num') throw new ParseFail(help, line.spanHere())
  line.pos += neg ? 2 : 1
  return (neg ? -1 : 1) * Number(numTok.text)
}
function specSym(line: Line, sym: string, help: string): void {
  if (!line.isSym(sym)) throw new ParseFail(help, line.spanHere())
  line.pos += 1
}

// The `what` slot: `[A]`/`[B]`/`[C]` → a registry; `visited`; else a traverser reference (`t1` or a name).
function parseWhat(line: Line): What {
  if (line.isSym('[')) {
    line.pos += 1
    const reg = line.word('expected a registry A, B or C')
    const up = reg.text.toUpperCase()
    if (up !== 'A' && up !== 'B' && up !== 'C') {
      throw new ParseFail(`"${reg.text}" is not a registry (A, B, C)`, { start: reg.start, end: reg.end })
    }
    line.expectSym(']')
    return { kind: 'reg', reg: up.toLowerCase() as 'a' | 'b' | 'c' }
  }
  const w = line.word('expected a traverser (t1 or a name), [A]/[B]/[C], or visited')
  if (w.text === 'visited') return { kind: 'visited' }
  return { kind: 'traverser', ref: w.text }
}

// The guard after `if`: a single word is a named-predicate reference; anything else (incl. a compound
// `isOct and hasA` that references saved predicates by name) is an inline predicate delegated whole to
// src/dsl, whose bare names compile-time resolveNames then inlines.
function parseGuard(line: Line): Guard {
  const from = line.pos
  const to = line.toks.length
  if (to <= from) throw new ParseFail('expected a condition after "if"', line.endSpan())
  if (to - from === 1 && line.toks[from].kind === 'word') {
    line.pos = to
    return { pred: { kind: 'named', name: line.toks[from].text } }
  }
  const startOff = line.toks[from].start
  const sub = line.src.slice(startOff, line.toks[to - 1].end)
  const r = parsePredicate(sub)
  if (!r.ok) throw new ParseFail(r.error.message, offset(r.error.span, startOff))
  line.pos = to
  return { pred: { kind: 'inline', pred: r.value } }
}

function parseStmt(line: Line): InitStmt {
  const head = line.word('expected "auto-place"')
  if (head.text !== 'auto-place') {
    throw new ParseFail(`expected "auto-place", got "${head.text}"`, { start: head.start, end: head.end })
  }
  const shapeTok = line.word('expected "line" or "blob" after "auto-place"')
  if (shapeTok.text !== 'line' && shapeTok.text !== 'blob') {
    throw new ParseFail(`unknown shape "${shapeTok.text}" — use "line" or "blob"`, {
      start: shapeTok.start,
      end: shapeTok.end,
    })
  }
  // Count/comma/brace mistakes in the { … } spec report this whole template — the confusing errors.
  const help =
    shapeTok.text === 'line'
      ? 'line takes {what, angle, percent, param}'
      : 'blob takes {what, x%, y%, radius, param}'
  specSym(line, '{', help)
  const what = parseWhat(line)
  specSym(line, ',', help)
  let shape: Shape
  let param: number
  if (shapeTok.text === 'line') {
    const angle = specNumber(line, help)
    specSym(line, ',', help)
    const percent = specNumber(line, help)
    specSym(line, ',', help)
    param = specNumber(line, help)
    shape = { kind: 'line', angle, percent }
  } else {
    const x = specNumber(line, help)
    specSym(line, ',', help)
    const y = specNumber(line, help)
    specSym(line, ',', help)
    const radius = specNumber(line, help)
    specSym(line, ',', help)
    param = specNumber(line, help)
    shape = { kind: 'blob', x, y, radius }
  }
  specSym(line, '}', help)
  let guard: Guard | undefined
  if (line.isWord('if')) {
    line.pos += 1
    guard = parseGuard(line)
  }
  line.expectEnd()
  return { shape, what, param, guard }
}

export function parseDoc(src: string): Result<Doc> {
  const lexed = lexProgram(src)
  if (!lexed.ok) return lexed
  const stmts: InitStmt[] = []
  let lineToks: Tok[] = []
  try {
    for (const t of lexed.value) {
      if (t.kind === 'eof' || t.kind === 'nl') {
        if (lineToks.length > 0) stmts.push(parseStmt(new Line(lineToks, src)))
        lineToks = []
      } else {
        lineToks.push(t)
      }
    }
  } catch (e) {
    if (e instanceof ParseFail) return { ok: false, error: { message: e.message, span: e.span } }
    throw e
  }
  return { ok: true, value: stmts }
}
