// Tokenizer for the predicate DSL. Hand-rolled (no parser library — matches the codebase). Two
// subtleties around identifiers:
//  - A hyphen continues an identifier only when it sits BEFORE A LETTER (so `adjacent-visited-unique`
//    is one token, but `visited - 1` is three — a hyphen before a digit/space is the minus operator).
//  - Digits and underscores continue an identifier (but can't start one), so custom names like
//    `Has_A`, `Level_2`, `rule3` lex as a single identifier and can be referenced by name.
// A path segment like `.e1`/`.r1` therefore lexes as one identifier (`e1`) — parse.ts splits it.

import type { Result, Span } from './types'

export type TokenKind =
  | 'number'
  | 'ident'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma' // separates elements in a `[A, B]` list
  | 'colon' // : — a list reducer, `[a, b]:sum`
  | 'dot' // . — starts an attribute's edge-hop path (`visited.e1`)
  | 'op' // + - * / %
  | 'cmp' // == != < <= > >= (and bare =, normalized to == by the parser)
  | 'eof'

export type Token = { kind: TokenKind; text: string; span: Span }

const isDigit = (c: string) => c >= '0' && c <= '9'
// Letters that may start/continue an identifier. Uppercase is allowed so the traverser registries
// P/Q/R lex as identifiers (attribute names); tile attributes and shape names stay lowercase.
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
// Characters that CONTINUE an identifier (but can't start one): letters, digits, underscore.
const isIdentCont = (c: string) => isAlpha(c) || isDigit(c) || c === '_'

function fail(message: string, span: Span): Result<Token[]> {
  return { ok: false, error: { message, span } }
}

export function lex(src: string): Result<Token[]> {
  const tokens: Token[] = []
  const n = src.length
  let i = 0

  while (i < n) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1
      continue
    }
    const start = i

    // numbers: 12, 3.5, .5
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      i += 1
      while (i < n && isDigit(src[i])) i += 1
      if (src[i] === '.') {
        i += 1
        while (i < n && isDigit(src[i])) i += 1
      }
      tokens.push({ kind: 'number', text: src.slice(start, i), span: { start, end: i } })
      continue
    }

    // identifiers: start with a letter, then letters/digits/underscores, plus internal hyphens (a
    // hyphen continues only before a LETTER, so `visited - 1` stays three tokens).
    if (isAlpha(c)) {
      i += 1
      while (i < n) {
        const ch = src[i]
        if (isIdentCont(ch)) {
          i += 1
        } else if (ch === '-' && isAlpha(src[i + 1] ?? '')) {
          i += 1
        } else {
          break
        }
      }
      tokens.push({ kind: 'ident', text: src.slice(start, i), span: { start, end: i } })
      continue
    }

    if (c === '(') {
      tokens.push({ kind: 'lparen', text: c, span: { start, end: i + 1 } })
      i += 1
      continue
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen', text: c, span: { start, end: i + 1 } })
      i += 1
      continue
    }
    if (c === '[') {
      tokens.push({ kind: 'lbracket', text: c, span: { start, end: i + 1 } })
      i += 1
      continue
    }
    if (c === ']') {
      tokens.push({ kind: 'rbracket', text: c, span: { start, end: i + 1 } })
      i += 1
      continue
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', text: c, span: { start, end: i + 1 } })
      i += 1
      continue
    }
    // A lone `.` (the path-hop separator, `visited.e1`). A `.` that begins a number (`.5`) was already
    // consumed above; the DSL never sees the two-char `..` range (that's traverser-only), so a `.` here
    // is unambiguously a path separator.
    if (c === '.') {
      tokens.push({ kind: 'dot', text: c, span: { start, end: i + 1 } })
      i += 1
      continue
    }
    if (c === ':') {
      tokens.push({ kind: 'colon', text: c, span: { start, end: i + 1 } })
      i += 1
      continue
    }

    // comparison operators (longest match first)
    if (c === '=') {
      const two = src[i + 1] === '='
      tokens.push({ kind: 'cmp', text: two ? '==' : '=', span: { start, end: i + (two ? 2 : 1) } })
      i += two ? 2 : 1
      continue
    }
    if (c === '!') {
      if (src[i + 1] === '=') {
        tokens.push({ kind: 'cmp', text: '!=', span: { start, end: i + 2 } })
        i += 2
        continue
      }
      return fail('unexpected "!" — did you mean "!="?', { start, end: i + 1 })
    }
    if (c === '<' || c === '>') {
      const two = src[i + 1] === '='
      tokens.push({ kind: 'cmp', text: two ? `${c}=` : c, span: { start, end: i + (two ? 2 : 1) } })
      i += two ? 2 : 1
      continue
    }

    // arithmetic operators
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '%') {
      tokens.push({ kind: 'op', text: c, span: { start, end: i + 1 } })
      i += 1
      continue
    }

    return fail(`unexpected character "${c}"`, { start, end: i + 1 })
  }

  tokens.push({ kind: 'eof', text: '', span: { start: n, end: n } })
  return { ok: true, value: tokens }
}
