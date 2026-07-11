// Recursive-descent parser for the predicate DSL. Precedence, low to high:
//   or  <  and  <  not  <  comparison  <  + -  <  * / %  <  unary -  <  atom
// A whole program is a predicate (the panes evaluate a boolean); parseExpr is exposed for tests and
// the future traverser DSL. Errors come back as a Result with a message + span (for the editor to
// point at), never thrown across the boundary.

import type { ArithOp, AttrName, AttrRef, CompareOp, Expr, PathSeg, Pred, RegLetter, Result, Span, TilePath } from './types'
import { lex, type Token } from './lex'
import { attrSpec } from './attributes'

const KEYWORDS = new Set(['and', 'or', 'not', 'of', 'tile', 'default'])
const NUM_REDUCERS = new Set(['sum', 'avg', 'min', 'max'])
const BOOL_REDUCERS = new Set(['all', 'any', 'none', 'xor'])
const isReducer = (w: string): boolean => NUM_REDUCERS.has(w) || BOOL_REDUCERS.has(w)

// A parsed `[…]` list, classified numeric vs shape (they can't mix) with its optional reducer word.
// Shared by parseListExpr (a value) and parseListCompare (a boolean comparison).
type ParsedList =
  | { kind: 'num'; elems: Expr[]; reducer?: string }
  | { kind: 'shape'; paths: (TilePath | undefined)[]; reducer?: string }

class ParseFail extends Error {
  readonly span: Span
  constructor(message: string, span: Span) {
    super(message)
    this.span = span
  }
}

class Parser {
  private pos = 0
  private readonly toks: ReadonlyArray<Token>
  constructor(toks: ReadonlyArray<Token>) {
    this.toks = toks
  }

  private peek(): Token {
    return this.toks[this.pos]
  }
  private next(): Token {
    return this.toks[this.pos++]
  }
  private expect(kind: Token['kind'], message: string): Token {
    const t = this.peek()
    if (t.kind !== kind) throw new ParseFail(message, t.span)
    return this.next()
  }
  expectEof(): void {
    const t = this.peek()
    if (t.kind !== 'eof') throw new ParseFail(`unexpected "${t.text}"`, t.span)
  }

  // ---- predicates ----
  parseOr(): Pred {
    let left = this.parseAnd()
    while (this.isKeyword('or')) {
      this.next()
      left = { kind: 'bool', op: 'or', left, right: this.parseAnd() }
    }
    return left
  }
  private parseAnd(): Pred {
    let left = this.parseNot()
    while (this.isKeyword('and')) {
      this.next()
      left = { kind: 'bool', op: 'and', left, right: this.parseNot() }
    }
    return left
  }
  private parseNot(): Pred {
    if (this.isKeyword('not')) {
      this.next()
      return { kind: 'not', operand: this.parseNot() }
    }
    return this.parseComparison()
  }
  private parseComparison(): Pred {
    // A leading "(" may open either a predicate group or an expression group. Look ahead at this
    // paren's own depth for a comparison/boolean keyword to decide, without backtracking.
    if (this.peek().kind === 'lparen' && this.parenIsPredicate()) {
      this.next()
      const inner = this.parseOr()
      this.expect('rparen', 'expected ")"')
      return { kind: 'pgroup', inner }
    }
    if (this.isKeyword('tile-type')) return this.parseShapeTest()
    if (this.isKeyword('exists')) return this.parseExistsTest()
    if (this.looksLikeBarePredicateRef()) {
      const t = this.next()
      return { kind: 'predref', name: t.text }
    }
    if (this.peek().kind === 'lbracket' && this.boolListAhead()) return this.parseListCompare()
    const left = this.parseExpr()
    const t = this.peek()
    if (t.kind !== 'cmp') {
      throw new ParseFail('expected a comparison, e.g. "… == 4"', t.span)
    }
    this.next()
    const op: CompareOp = t.text === '=' ? '==' : (t.text as CompareOp)
    const right = this.parseExpr()
    return { kind: 'compare', op, left, right }
  }

  // A bare identifier that names neither a keyword nor a known attribute, with nothing after it that
  // would extend it into a numeric expression or comparison (no .path, index, arithmetic, or `==`), is
  // a reference to another predicate BY NAME (`isCrowded and hasC`) — resolved later against the
  // caller's predicate library, since this parser has no registry to validate the name against. Names
  // can't contain spaces (enforced when authoring), so `_` joins words: `Has_A and Has_C`.
  private looksLikeBarePredicateRef(): boolean {
    const t = this.peek()
    if (t.kind !== 'ident' || KEYWORDS.has(t.text) || t.text === 'tile-type' || t.text === 'exists' || attrSpec(t.text)) return false
    // A bare registry letter (A/B/C) is a value, not a predicate name — let it fall through to the
    // expression path so `A` alone reports "expected a comparison" rather than "unknown predicate".
    if (/^[abc]$/i.test(t.text)) return false
    const nxt = this.toks[this.pos + 1]
    return nxt.kind === 'eof' || nxt.kind === 'rparen' || (nxt.kind === 'ident' && (nxt.text === 'and' || nxt.text === 'or'))
  }
  // tile-type == <shape> / tile-type != <shape>. The shape name is any identifier (not validated —
  // shapes are tiling-specific and predicates persist across tilings).
  private parseShapeTest(): Pred {
    const head = this.next() // tile-type
    // optional .path: test the shape of another tile — `tile-type.e0 == wedge`.
    const path = this.peek().kind === 'dot' ? this.parsePath() : undefined
    if (this.isKeyword('of')) {
      this.next()
      if (!this.isKeyword('tile')) throw new ParseFail('expected "tile" after "of"', this.peek().span)
      this.next()
    }
    const cmp = this.peek()
    if (cmp.kind !== 'cmp' || (cmp.text !== '==' && cmp.text !== '!=' && cmp.text !== '=')) {
      throw new ParseFail('tile-type can only be compared with == or != to a shape name', head.span)
    }
    this.next()
    const op = cmp.text === '!=' ? '!=' : '=='
    const nameTok = this.peek()
    if (nameTok.kind !== 'ident' || KEYWORDS.has(nameTok.text)) {
      throw new ParseFail('expected a shape name, e.g. tile-type == square', nameTok.span)
    }
    this.next()
    return path ? { kind: 'shape', op, shape: nameTok.text, path } : { kind: 'shape', op, shape: nameTok.text }
  }

  // exists.<path> — true iff the path resolves to a real tile (false at a boundary, a missing tile, or a
  // relative hop in a walker-free context). A path is required: the current tile always exists, so bare
  // `exists` is almost certainly a typo for `exists.e0` / `exists.f0`.
  private parseExistsTest(): Pred {
    const head = this.next() // 'exists'
    if (this.peek().kind !== 'dot') {
      throw new ParseFail('"exists" needs a path — the current tile always exists, e.g. exists.f0 or exists.e0', head.span)
    }
    return { kind: 'exists', path: this.parsePath() }
  }

  private parenIsPredicate(): boolean {
    let depth = 0
    for (let k = this.pos; k < this.toks.length; k += 1) {
      const t = this.toks[k]
      if (t.kind === 'lparen') {
        depth += 1
      } else if (t.kind === 'rparen') {
        depth -= 1
        if (depth === 0) return false
      } else if (t.kind === 'eof') {
        break
      } else if (t.kind === 'cmp') {
        // A comparison/boolean anywhere inside this paren (any nesting depth) means it's a predicate
        // group — so redundant wrapping like ((visited == 1)) is still recognised. The matching ")"
        // above returns false first for the (expr) == x case, where the operator sits outside.
        return true
      } else if (t.kind === 'ident' && (t.text === 'and' || t.text === 'or' || t.text === 'not')) {
        return true
      } else if (
        depth === 1 &&
        t.kind === 'ident' &&
        !KEYWORDS.has(t.text) &&
        t.text !== 'tile-type' &&
        !attrSpec(t.text)
      ) {
        // A lone predicate-name reference filling this whole paren, e.g. `(isCrowded)`
        // (`(not isCrowded)` is already caught above, by the "not" keyword itself).
        if (this.toks[k - 1]?.kind === 'lparen' && this.toks[k + 1]?.kind === 'rparen') return true
      }
    }
    return false
  }

  // ---- expressions ----
  parseExpr(): Expr {
    return this.parseAdd()
  }
  private parseAdd(): Expr {
    let left = this.parseMul()
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().text as ArithOp
      left = { kind: 'bin', op, left, right: this.parseMul() }
    }
    return left
  }
  private parseMul(): Expr {
    let left = this.parseUnary()
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = this.next().text as ArithOp
      left = { kind: 'bin', op, left, right: this.parseUnary() }
    }
    return left
  }
  private parseUnary(): Expr {
    if (this.isOp('-')) {
      this.next()
      return { kind: 'neg', operand: this.parseUnary() }
    }
    return this.parseAtom()
  }
  private parseAtom(): Expr {
    const t = this.peek()
    if (t.kind === 'number') {
      this.next()
      return { kind: 'number', value: Number(t.text) }
    }
    if (t.kind === 'lparen') {
      this.next()
      const inner = this.parseExpr()
      this.expect('rparen', 'expected ")"')
      return { kind: 'group', inner }
    }
    if (t.kind === 'lbracket') {
      return this.parseListExpr()
    }
    if (t.kind === 'ident') {
      // A bare tile registry A/B/C is a value on its own — `[…]` now means "a list", so a lone registry
      // needn't be bracketed (`A`, `A.e1`); a one-element list `[A]` is still fine and distinct.
      if (/^[abc]$/i.test(t.text)) {
        this.next()
        const path = this.peek().kind === 'dot' ? this.parsePath() : undefined
        const reg = t.text.toLowerCase() as RegLetter
        return path ? { kind: 'regterm', reg, path } : { kind: 'regterm', reg }
      }
      return this.parseAttribute()
    }
    throw new ParseFail('expected a number, attribute, a registry (A/B/C), "[…]", or "("', t.span)
  }

  // A `[…]` list used as a VALUE (an atom): numeric elements reduced by sum (default) / avg / min / max.
  // `[A]` and `[A, B]` are the common cases (registry reads / their sum). A boolean reducer or shape
  // elements here are an error — those only make sense compared, and are caught at the comparison level
  // (boolListAhead / parseListCompare).
  private parseListExpr(): Expr {
    const span = this.peek().span
    const list = this.parseListValue()
    if (list.kind === 'shape') {
      throw new ParseFail('tile-type values need a boolean reducer + comparison, e.g. [tile-type.r1, tile-type.r2]:any == square', span)
    }
    if (list.reducer && BOOL_REDUCERS.has(list.reducer)) {
      throw new ParseFail(`"${list.reducer}" needs a comparison and must be on the left, e.g. [a, b]:${list.reducer} == 1`, span)
    }
    return { kind: 'list', reducer: (list.reducer as 'sum' | 'avg' | 'min' | 'max' | undefined) ?? 'sum', elems: list.elems }
  }

  // A boolean-reduced list comparison: `[…]:all|any|none|xor <cmp> <right>`. Reached from parseComparison
  // only once boolListAhead has confirmed the trailing boolean reducer.
  private parseListCompare(): Pred {
    const span = this.peek().span
    const list = this.parseListValue()
    const reducer = list.reducer
    if (!reducer || !BOOL_REDUCERS.has(reducer)) throw new ParseFail('expected a boolean reducer (all, any, none, xor)', span)
    const red = reducer as 'all' | 'any' | 'none' | 'xor'
    const t = this.peek()
    if (t.kind !== 'cmp') throw new ParseFail('expected a comparison after the list, e.g. [a, b]:any == 1', t.span)
    this.next()
    const op: CompareOp = t.text === '=' ? '==' : (t.text as CompareOp)
    if (list.kind === 'shape') {
      if (op !== '==' && op !== '!=') throw new ParseFail('tile-type values compare only with == or !=', t.span)
      const nameTok = this.peek()
      if (nameTok.kind !== 'ident' || KEYWORDS.has(nameTok.text)) {
        throw new ParseFail('expected a shape name, e.g. == square', nameTok.span)
      }
      this.next()
      return { kind: 'shapecmp', reducer: red, paths: list.paths, op, shape: nameTok.text }
    }
    const right = this.parseExpr()
    return { kind: 'listcmp', reducer: red, elems: list.elems, op, right }
  }

  // Parse `[ elem, elem, … ]` + an optional `:reducer`, classifying the list numeric vs shape (they
  // can't mix). Shared by the value and comparison forms above.
  private parseListValue(): ParsedList {
    this.expect('lbracket', 'expected "["')
    const elems: Expr[] = []
    const paths: (TilePath | undefined)[] = []
    let kind: 'num' | 'shape' | null = null
    for (;;) {
      const el = this.parseListElem()
      if (el.shape) {
        if (kind === 'num') throw new ParseFail("a list can't mix tile-type with numeric values", el.span)
        kind = 'shape'
        paths.push(el.path)
      } else {
        if (kind === 'shape') throw new ParseFail("a list can't mix tile-type with numeric values", el.span)
        kind = 'num'
        elems.push(el.expr)
      }
      if (this.peek().kind === 'comma') {
        this.next()
        continue
      }
      break
    }
    this.expect('rbracket', 'expected "," or "]" in the list')
    let reducer: string | undefined
    if (this.peek().kind === 'colon') {
      this.next()
      const w = this.peek()
      if (w.kind !== 'ident' || !isReducer(w.text)) {
        throw new ParseFail("expected a reducer after ':' — sum, avg, min, max, all, any, none or xor", w.span)
      }
      this.next()
      reducer = w.text
    }
    return kind === 'shape' ? { kind: 'shape', paths, reducer } : { kind: 'num', elems, reducer }
  }

  // One list element: `tile-type[.path]` (a shape value), a registry `A`/`B`/`C[.path]`, a number, or any
  // other attribute. A bare direction (`straight`, `r1`, `e2`…) is not a value — nudge to `visited.…`.
  private parseListElem(): { shape: true; path?: TilePath; span: Span } | { shape: false; expr: Expr; span: Span } {
    const t = this.peek()
    const span = t.span
    if (t.kind === 'ident' && t.text === 'tile-type') {
      this.next()
      const path = this.peek().kind === 'dot' ? this.parsePath() : undefined
      return { shape: true, path, span }
    }
    if (t.kind === 'ident' && /^[abc]$/i.test(t.text)) {
      this.next()
      const path = this.peek().kind === 'dot' ? this.parsePath() : undefined
      const reg = t.text.toLowerCase() as RegLetter
      return { shape: false, expr: path ? { kind: 'regterm', reg, path } : { kind: 'regterm', reg }, span }
    }
    // A bare direction is not a value: `straight` / `s` / `nearest-unvisited`, or a letter e/r/l followed
    // by a number (the lexer splits `r1` into `r` + `1`). Nudge to reading an attribute across it.
    if (t.kind === 'ident') {
      if (t.text === 'straight' || t.text === 's' || t.text === 'nearest-unvisited' || /^[erl][0-9]+$/.test(t.text)) {
        throw new ParseFail(`"${t.text}" is a direction, not a value — read an attribute across it, e.g. visited.${t.text}`, span)
      }
      // Defensive: also catch a letter + a separate number token, should the lexer ever split `r1`.
      const next = this.toks[this.pos + 1]
      if (/^[erl]$/.test(t.text) && next && next.kind === 'number') {
        throw new ParseFail(`"${t.text}${next.text}" is a direction, not a value — read an attribute across it, e.g. visited.${t.text}${next.text}`, span)
      }
    }
    if (t.kind === 'number') {
      this.next()
      return { shape: false, expr: { kind: 'number', value: Number(t.text) }, span }
    }
    if (t.kind === 'ident') {
      return { shape: false, expr: this.parseAttribute(), span }
    }
    throw new ParseFail('expected a list element: an attribute, a registry (A/B/C), a number, or tile-type', span)
  }

  // Lookahead from the current `[`: is it a list with a trailing BOOLEAN reducer (`…]:all|any|none|xor`)?
  // Those become a ListCompare (a Pred); numeric reducers / no reducer stay a value (parseAtom). Tracks
  // bracket depth so an inner index like `step[3]` inside the list doesn't fool the scan.
  private boolListAhead(): boolean {
    let depth = 0
    let k = this.pos
    for (; k < this.toks.length; k += 1) {
      const kind = this.toks[k].kind
      if (kind === 'lbracket') depth += 1
      else if (kind === 'rbracket') {
        depth -= 1
        if (depth === 0) {
          k += 1
          break
        }
      } else if (kind === 'eof') return false
    }
    if (this.toks[k]?.kind !== 'colon') return false
    const w = this.toks[k + 1]
    return !!w && w.kind === 'ident' && BOOL_REDUCERS.has(w.text)
  }
  private parseAttribute(): Expr {
    const t = this.next()
    const name = t.text
    if (KEYWORDS.has(name)) throw new ParseFail(`unexpected "${name}"`, t.span)
    const spec = attrSpec(name)
    if (!spec) throw new ParseFail(`unknown attribute "${name}"`, t.span)
    if (spec.rampOnly) {
      const letter = name.slice(-1).toUpperCase()
      throw new ParseFail(`read registry ${letter} as [${letter}] — the "${name}" name is only for colour ramps`, t.span)
    }

    const node: AttrRef = { kind: 'attr', name: name as AttrName, scope: spec.scopes[0] ?? 'tile' }

    // index: name[n]
    if (this.peek().kind === 'lbracket') {
      if (!spec.indexed) throw new ParseFail(`"${name}" does not take an index`, this.peek().span)
      this.next()
      const numTok = this.peek()
      if (numTok.kind !== 'number') throw new ParseFail('expected an index number after "["', numTok.span)
      this.next()
      const idx = Number(numTok.text)
      if (!Number.isInteger(idx) || idx < 0) {
        throw new ParseFail('index must be a whole number ≥ 0', numTok.span)
      }
      node.index = idx
      this.expect('rbracket', 'expected "]"')
    } else if (spec.indexed) {
      throw new ParseFail(`"${name}" needs an index, e.g. ${name}[0]`, t.span)
    }

    // optional scope: of tile
    if (this.isKeyword('of')) {
      this.next()
      const scopeTok = this.peek()
      if (scopeTok.kind !== 'ident' || scopeTok.text !== 'tile') {
        throw new ParseFail('expected "tile" after "of"', scopeTok.span)
      }
      this.next()
      node.scope = 'tile'
    }

    // optional .path: read the attribute on ANOTHER tile. Traverser attributes read the walker's own
    // state (not a tile), so a path on one is meaningless — reject it.
    if (this.peek().kind === 'dot') {
      if (!spec.scopes.includes('tile')) {
        throw new ParseFail(`"${name}" is the walker's own state — it can't take a .path`, t.span)
      }
      node.path = this.parsePath()
    }

    // optional default: default N (required when the attribute may be absent)
    if (this.isKeyword('default')) {
      this.next()
      let sign = 1
      if (this.isOp('-')) {
        sign = -1
        this.next()
      }
      const dTok = this.peek()
      if (dTok.kind !== 'number') throw new ParseFail('expected a default value, e.g. default 0', dTok.span)
      this.next()
      node.fallback = sign * Number(dTok.text)
    } else if (spec.needsDefault) {
      const ex = spec.indexed ? `${name}[0]` : name
      throw new ParseFail(`"${name}" may not exist for every tile — add a default, e.g. ${ex} default 0`, t.span)
    }

    return node
  }

  // One or more `.`-segments after a leaf: `.e1`, `.r1.e5`, `.target`. Called only when the next token
  // is a `dot`. Edge/turn/straight/unvisited segments chain; `target`/`tile N` are terminal (they name
  // a tile directly) and must be a path's only hop.
  private parsePath(): TilePath {
    const segs: PathSeg[] = []
    while (this.peek().kind === 'dot') {
      this.next() // consume '.'
      const segTok = this.peek()
      const seg = this.parseSegment()
      if (seg.kind === 'target' || seg.kind === 'tile') {
        // Terminal: it names a tile directly, so it must be the ONLY hop in the path (no hops before
        // or after) — there's no defined heading to continue from.
        if (segs.length > 0 || this.peek().kind === 'dot') {
          throw new ParseFail('".target" / ".tile N" names a tile directly — it must be the only hop', segTok.span)
        }
        return [seg]
      }
      // `.fN` is a BASE: it names the found tile the chain starts from, so it must come first; edge hops
      // may follow it (`.f1.e0`) but it can never sit after another hop (`.e0.f1`).
      if (seg.kind === 'found' && segs.length > 0) {
        throw new ParseFail('a found-tile reference "fN" must be the first hop, e.g. .f1 or .f1.e0', segTok.span)
      }
      segs.push(seg)
    }
    return segs
  }

  // One path segment (the token(s) after a `.`): straight/s, nearest-unvisited, target, tile N, or an
  // edge/turn `eN`/`rN`/`lN` (.e5, .r1, .l2). The lexer now yields `e5` as ONE identifier (digits
  // continue an identifier), so we split it with a regex here — the same way the traverser DSL's
  // parseEdgeRef reads a move. Bare numbers (`.1`) are rejected — edges are `.eN`.
  private parseSegment(): PathSeg {
    const t = this.peek()
    if (t.kind !== 'ident') {
      throw new ParseFail('expected an edge after ".", e.g. .e1, .r1, .straight, .target', t.span)
    }
    const word = t.text
    if (word === 'straight' || word === 's') {
      this.next()
      return { kind: 'straight' }
    }
    if (word === 'nearest-unvisited') {
      this.next()
      return { kind: 'unvisited' }
    }
    if (word === 'target') {
      this.next()
      return { kind: 'target' }
    }
    if (word === 'tile') {
      this.next()
      const num = this.peek()
      if (num.kind !== 'number') throw new ParseFail('expected a tile number, e.g. .tile 12', num.span)
      this.next()
      const idx = Number(num.text)
      if (!Number.isInteger(idx) || idx < 0) throw new ParseFail('tile number must be a whole number ≥ 0', num.span)
      return { kind: 'tile', index: idx }
    }
    const m = /^([erlf])([0-9]+)$/.exec(word)
    if (m) {
      this.next()
      const n = Number(m[2])
      if (m[1] === 'e') return { kind: 'edge', index: n }
      if (m[1] === 'f') return { kind: 'found', index: n }
      if (n < 1) throw new ParseFail('a turn must be r1/l1 or higher', t.span)
      return { kind: 'turn', dir: m[1] as 'r' | 'l', n }
    }
    throw new ParseFail(`"${word}" is not an edge — use .e0, .r1/.l1…, .straight, .nearest-unvisited, .fN, or .target`, t.span)
  }

  private isKeyword(word: string): boolean {
    const t = this.peek()
    return t.kind === 'ident' && t.text === word
  }
  private isOp(op: string): boolean {
    const t = this.peek()
    return t.kind === 'op' && t.text === op
  }
}

function run<T>(src: string, parse: (p: Parser) => T): Result<T> {
  const lexed = lex(src)
  if (!lexed.ok) return lexed
  const parser = new Parser(lexed.value)
  try {
    const value = parse(parser)
    parser.expectEof()
    return { ok: true, value }
  } catch (e) {
    if (e instanceof ParseFail) return { ok: false, error: { message: e.message, span: e.span } }
    throw e
  }
}

export function parsePredicate(src: string): Result<Pred> {
  return run(src, (p) => p.parseOr())
}

export function parseExpr(src: string): Result<Expr> {
  return run(src, (p) => p.parseExpr())
}
