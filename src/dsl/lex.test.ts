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

  it('lexes @ as an at token; an edge like e1 is one identifier (parse.ts splits it)', () => {
    const r = lex('visited@e1')
    if (!r.ok) throw new Error('expected ok')
    expect(r.value.map((t: Token) => t.kind)).toEqual(['ident', 'at', 'ident', 'eof'])
    expect(texts('visited@e1')).toEqual(['visited', '@', 'e1'])
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
