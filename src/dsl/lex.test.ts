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
    const r = lex('visited @ 4')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.span).toEqual({ start: 8, end: 9 })
  })

  it('fails on a lone "!"', () => {
    expect(lex('a ! b').ok).toBe(false)
  })
})
