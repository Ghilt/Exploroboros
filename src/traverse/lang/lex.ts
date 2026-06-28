// Tokenizer for the traverser-program DSL. Statement-oriented: it keeps NEWLINEs (statements are one
// per line) and tracks absolute source offsets so error spans point back into the textarea. It only
// needs to find the STRUCTURAL pieces (keywords, `[ ] , @ -> =`, words, numbers); the operators that
// appear inside a guard/formula are lumped into `sym` tokens — those regions are sliced out as raw
// substrings and handed to src/dsl's parser, so this lexer never has to understand `==`, `+`, etc.

import type { Result, Span } from '../../dsl'

export type TokKind = 'word' | 'num' | 'sym' | 'nl' | 'eof'
export type Tok = { kind: TokKind; text: string; start: number; end: number }

const isDigit = (c: string) => c >= '0' && c <= '9'
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')

// Multi-char symbols matched before their single-char prefixes.
const MULTI = ['->', '==', '!=', '<=', '>=']
const SINGLE = '()[],@=<>+-*/%!'

function fail(message: string, span: Span): Result<Tok[]> {
  return { ok: false, error: { message, span } }
}

export function lexProgram(src: string): Result<Tok[]> {
  const toks: Tok[] = []
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === '\n') {
      toks.push({ kind: 'nl', text: '\n', start: i, end: i + 1 })
      i += 1
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i += 1
      continue
    }
    if (c === '#') {
      // comment to end of line
      while (i < n && src[i] !== '\n') i += 1
      continue
    }
    const start = i
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      i += 1
      while (i < n && isDigit(src[i])) i += 1
      if (src[i] === '.') {
        i += 1
        while (i < n && isDigit(src[i])) i += 1
      }
      toks.push({ kind: 'num', text: src.slice(start, i), start, end: i })
      continue
    }
    // word: a letter, then letters/digits, with internal hyphens (only before an alphanumeric) so
    // `max-split`, `r1`, `straight`, `isCrowded`, `P` are each one token.
    if (isAlpha(c)) {
      i += 1
      while (i < n) {
        const ch = src[i]
        if (isAlpha(ch) || isDigit(ch)) {
          i += 1
        } else if (ch === '-' && (isAlpha(src[i + 1] ?? '') || isDigit(src[i + 1] ?? ''))) {
          i += 1
        } else {
          break
        }
      }
      toks.push({ kind: 'word', text: src.slice(start, i), start, end: i })
      continue
    }
    const two = src.slice(i, i + 2)
    if (MULTI.includes(two)) {
      toks.push({ kind: 'sym', text: two, start, end: i + 2 })
      i += 2
      continue
    }
    if (SINGLE.includes(c)) {
      toks.push({ kind: 'sym', text: c, start, end: i + 1 })
      i += 1
      continue
    }
    return fail(`unexpected character "${c}"`, { start, end: i + 1 })
  }
  toks.push({ kind: 'eof', text: '', start: n, end: n })
  return { ok: true, value: toks }
}
