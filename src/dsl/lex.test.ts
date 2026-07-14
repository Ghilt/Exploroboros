import { describe, it, expect } from 'vitest'
import { lex, type Token } from './lex'

function kinds(src: string): string[] {
  const r = lex(src)
  if (!r.ok) throw new Error(`lex failed: ${r.error.message}`)
  return r.value.map((t) => t.kind)
}
function texts(src: string): string[] {
  const r = lex(src)
  if (!r.ok) throw new Error(`lex failed: ${r.error.message}`)
  return r.value.filter((t) => t.kind !== 'eof').map((t) => t.text)
}

describe('lex', () => {
  it('treats a hyphenated keyword as a single identifier', () => {
    expect(texts('adjacent-visited-unique')).toEqual(['adjacent-visited-unique'])
    expect(texts('tile-number')).toEqual(['tile-number'])
  })

  it('distinguishes the minus operator from a hyphen inside an identifier', () => {
    // hyphen between letters continues the ident; otherwise it is the minus op
    expect(texts('visited - 1')).toEqual(['visited', '-', '1'])
    expect(kinds('visited - 1')).toEqual(['ident', 'op', 'number', 'eof'])
    expect(texts('registry-a - 2')).toEqual(['registry-a', '-', '2'])
  })

  it('tokenizes an indexed attribute', () => {
    expect(kinds('step[3]')).toEqual(['ident', 'lbracket', 'number', 'rbracket', 'eof'])
    expect(texts('step[3]')).toEqual(['step', '[', '3', ']'])
  })

  it('matches the two-char comparison operators and the bare =', () => {
    expect(texts('a==b')).toEqual(['a', '==', 'b'])
    expect(texts('a!=b')).toEqual(['a', '!=', 'b'])
    expect(texts('a<=b')).toEqual(['a', '<=', 'b'])
    expect(texts('a>=b')).toEqual(['a', '>=', 'b'])
    expect(texts('a<b')).toEqual(['a', '<', 'b'])
    expect(texts('a>b')).toEqual(['a', '>', 'b'])
    expect(texts('a=b')).toEqual(['a', '=', 'b'])
  })

  it('reads integer and decimal numbers', () => {
    expect(texts('12 3.5 .5')).toEqual(['12', '3.5', '.5'])
  })

  it('records spans pointing at each token', () => {
    const r = lex('visited == 4')
    if (!r.ok) throw new Error('expected ok')
    const [v, cmp, num] = r.value
    expect(v.span).toEqual({ start: 0, end: 7 })
    expect(cmp.span).toEqual({ start: 8, end: 10 })
    expect(num.span).toEqual({ start: 11, end: 12 })
  })

  it('always ends with an eof token', () => {
    const r = lex('')
    if (!r.ok) throw new Error('expected ok')
    expect(r.value.map((t: Token) => t.kind)).toEqual(['eof'])
  })

  it('fails on a stray character with a span', () => {
    const r = lex('visited $ 4')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.span).toEqual({ start: 8, end: 9 })
  })

  it('lexes . as a dot token; an edge like e1 is one identifier (parse.ts splits it)', () => {
    const r = lex('visited.e1')
    if (!r.ok) throw new Error('expected ok')
    expect(r.value.map((t: Token) => t.kind)).toEqual(['ident', 'dot', 'ident', 'eof'])
    expect(texts('visited.e1')).toEqual(['visited', '.', 'e1'])
  })

  it('a . followed by a digit is a number, not a path hop (so decimals survive the . separator)', () => {
    // The path separator shares the `.` character with decimals; the number branch wins only when a
    // digit follows, so `.5`/`3.5` stay numbers while `.e1` is a dot hop.
    expect(kinds('.5')).toEqual(['number', 'eof'])
    expect(texts('visited > 3.5')).toEqual(['visited', '>', '3.5'])
    expect(kinds('visited.e1')).toEqual(['ident', 'dot', 'ident', 'eof'])
  })

  it('a trailing . after an integer is a path separator when no digit follows (so .tile N.eN chains)', () => {
    // `5.e1` must split into the number `5` + a `.e1` hop, not lex the `5.` as one number and swallow the
    // separator — that's what lets `.tile 5.e0` chain an edge hop after the tile base.
    expect(texts('5.e1')).toEqual(['5', '.', 'e1'])
    expect(kinds('5.e1')).toEqual(['number', 'dot', 'ident', 'eof'])
    expect(texts('visited.tile 5.e0')).toEqual(['visited', '.', 'tile', '5', '.', 'e0'])
    // a real decimal still stays one number
    expect(texts('3.5')).toEqual(['3.5'])
  })

  it('rejects @ — it is no longer a DSL character (the path separator is now .)', () => {
    const r = lex('visited@e1')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.span).toEqual({ start: 7, end: 8 })
  })

  it('fails on a lone "!"', () => {
    expect(lex('a ! b').ok).toBe(false)
  })

  it('allows digits and underscores inside an identifier (for names like Has_A / Level_2 / rule3)', () => {
    expect(kinds('Has_A')).toEqual(['ident', 'eof'])
    expect(texts('Has_A')).toEqual(['Has_A'])
    expect(texts('Level_2')).toEqual(['Level_2'])
    expect(texts('rule3')).toEqual(['rule3'])
    expect(texts('Has_A and Has_C')).toEqual(['Has_A', 'and', 'Has_C'])
  })

  it('keeps `visited - 1` three tokens (a hyphen continues an identifier only before a LETTER)', () => {
    expect(texts('visited - 1')).toEqual(['visited', '-', '1'])
    expect(kinds('visited - 1')).toEqual(['ident', 'op', 'number', 'eof'])
    // digit-continuation must not swallow the minus:
    expect(texts('visited-1')).toEqual(['visited', '-', '1'])
    // …but a hyphen before a letter still joins (attribute names):
    expect(texts('first-step')).toEqual(['first-step'])
  })

  it('an underscore cannot START an identifier', () => {
    expect(lex('_foo').ok).toBe(false)
  })
})
