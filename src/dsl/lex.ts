// Tokenizer for the predicate DSL. Hand-rolled (no parser library — matches the codebase). The one
// subtlety is hyphens: a hyphen between letters continues an identifier (so `adjacent-visited-unique`
// is a single token), but a hyphen otherwise is the minus operator (so `visited - 1` is three tokens).

import type { Result, Span } from './types'

export type TokenKind =
  | 'number'
  | 'ident'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'comma' // separates registries in a `[A, B]` read
  | 'at' // @ — starts an attribute's edge-hop path (`visited@e1`)
  | 'op' // + - * / %
  | 'cmp' // == != < <= > >= (and bare =, normalized to == by the parser)
  | 'eof'

export type Token = { kind: TokenKind; text: string; span: Span }

const isDigit = (c: string) => c >= '0' && c <= '9'
// Letters that may start/continue an identifier. Uppercase is allowed so the traverser registries
// P/Q/R lex as identifiers (attribute names); tile attributes and shape names stay lowercase.
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')

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

    // identifiers: lowercase letters with internal hyphens (a hyphen continues only before a letter)
    if (isAlpha(c)) {
      i += 1
      while (i < n) {
        const ch = src[i]
        if (isAlpha(ch)) {
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
    if (c === '@') {
      tokens.push({ kind: 'at', text: c, span: { start, end: i + 1 } })
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
