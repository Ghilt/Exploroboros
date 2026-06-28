// Recursive-descent parser for the predicate DSL. Precedence, low to high:
//   or  <  and  <  not  <  comparison  <  + -  <  * / %  <  unary -  <  atom
// A whole program is a predicate (the panes evaluate a boolean); parseExpr is exposed for tests and
// the future traverser DSL. Errors come back as a Result with a message + span (for the editor to
// point at), never thrown across the boundary.

import type { ArithOp, AttrName, AttrRef, CompareOp, Expr, Pred, RegLetter, Result, Span } from './types'
import { lex, type Token } from './lex'
import { attrSpec } from './attributes'

const KEYWORDS = new Set(['and', 'or', 'not', 'of', 'tile', 'default'])

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
  // tile-type == <shape> / tile-type != <shape>. The shape name is any identifier (not validated —
  // shapes are tiling-specific and predicates persist across tilings).
  private parseShapeTest(): Pred {
    const head = this.next() // tile-type
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
    return { kind: 'shape', op, shape: nameTok.text }
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
      return this.parseRegRead()
    }
    if (t.kind === 'ident') {
      return this.parseAttribute()
    }
    throw new ParseFail('expected a number, attribute, "[A]", or "("', t.span)
  }

  // A tile-registry read: [A], [a], or [A, B] (the sum). Replaces the old registry-a attribute name.
  private parseRegRead(): Expr {
    const open = this.next() // '['
    const regs: RegLetter[] = []
    for (;;) {
      const tok = this.peek()
      if (tok.kind !== 'ident' || !/^[abc]$/i.test(tok.text)) {
        throw new ParseFail('expected a registry letter A, B or C, e.g. [A] or [A, B]', tok.span)
      }
      this.next()
      regs.push(tok.text.toLowerCase() as RegLetter)
      if (this.peek().kind === 'comma') {
        this.next()
        continue
      }
      break
    }
    this.expect('rbracket', 'expected "]"')
    if (regs.length === 0) throw new ParseFail('a registry read needs at least one letter, e.g. [A]', open.span)
    return { kind: 'reg', regs }
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
