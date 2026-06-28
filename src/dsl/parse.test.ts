import { describe, it, expect } from 'vitest'
import { parsePredicate, parseExpr } from './parse'
import type { Pred } from './types'

function ok(src: string): Pred {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(`parse failed: ${r.error.message}`)
  return r.value
}
function errOf(src: string): string {
  const r = parsePredicate(src)
  if (r.ok) throw new Error('expected a parse error')
  return r.error.message
}

describe('parse — precedence & structure', () => {
  it('respects % > == > and', () => {
    expect(ok('visited % 2 == 1 and [A] > 0')).toEqual({
      kind: 'bool',
      op: 'and',
      left: {
        kind: 'compare',
        op: '==',
        left: { kind: 'bin', op: '%', left: { kind: 'attr', name: 'visited', scope: 'tile' }, right: { kind: 'number', value: 2 } },
        right: { kind: 'number', value: 1 },
      },
      right: {
        kind: 'compare',
        op: '>',
        left: { kind: 'reg', regs: ['a'] },
        right: { kind: 'number', value: 0 },
      },
    })
  })

  it('parses a registry read [A] and a sum [A, B]', () => {
    expect(ok('[A] > 0')).toEqual({
      kind: 'compare',
      op: '>',
      left: { kind: 'reg', regs: ['a'] },
      right: { kind: 'number', value: 0 },
    })
    expect(ok('[A, b] == 2')).toEqual({
      kind: 'compare',
      op: '==',
      left: { kind: 'reg', regs: ['a', 'b'] },
      right: { kind: 'number', value: 2 },
    })
  })

  it('rejects the old registry-a name with a pointer to [A]', () => {
    expect(errOf('registry-a > 0')).toContain('[A]')
  })

  it('parses the owner example with an optional "of tile" scope', () => {
    expect(ok('(visited of tile == 4)')).toEqual({
      kind: 'pgroup',
      inner: { kind: 'compare', op: '==', left: { kind: 'attr', name: 'visited', scope: 'tile' }, right: { kind: 'number', value: 4 } },
    })
    // "of tile" is optional and means the same thing
    expect(ok('visited == 4')).toEqual({
      kind: 'compare',
      op: '==',
      left: { kind: 'attr', name: 'visited', scope: 'tile' },
      right: { kind: 'number', value: 4 },
    })
  })

  it('disambiguates an expression group from a predicate group', () => {
    // "(1 + 2)" has no comparison inside -> expression group, then compared
    expect(ok('(1 + 2) == 3')).toEqual({
      kind: 'compare',
      op: '==',
      left: { kind: 'group', inner: { kind: 'bin', op: '+', left: { kind: 'number', value: 1 }, right: { kind: 'number', value: 2 } } },
      right: { kind: 'number', value: 3 },
    })
    // "(visited == 1)" has a comparison inside -> predicate group
    const p = ok('(visited == 1) or [A] == 2')
    expect(p.kind).toBe('bool')
    if (p.kind !== 'bool') return
    expect(p.op).toBe('or')
    expect(p.left.kind).toBe('pgroup')
  })

  it('accepts redundant / nested parentheses around a predicate', () => {
    expect(ok('((visited == 1))')).toEqual({
      kind: 'pgroup',
      inner: { kind: 'pgroup', inner: { kind: 'compare', op: '==', left: { kind: 'attr', name: 'visited', scope: 'tile' }, right: { kind: 'number', value: 1 } } },
    })
    expect(ok('((visited == 1)) and visited == 2').kind).toBe('bool')
    // an expression group is still distinguished from a predicate group
    expect(ok('(1 + 2) == 3').kind).toBe('compare')
  })

  it('normalizes a bare = to ==', () => {
    const p = ok('visited = 4')
    expect(p).toMatchObject({ kind: 'compare', op: '==' })
  })

  it('parses a tile-type test against any shape name', () => {
    expect(ok('tile-type == wedge')).toEqual({ kind: 'shape', op: '==', shape: 'wedge' })
    expect(ok('tile-type != triangle')).toEqual({ kind: 'shape', op: '!=', shape: 'triangle' })
    expect(ok('tile-type of tile == square')).toEqual({ kind: 'shape', op: '==', shape: 'square' })
    // combines with the rest
    const p = ok('tile-type == triangle and visited > 0')
    expect(p.kind).toBe('bool')
  })

  it('rejects a non-equality tile-type comparison or a non-shape operand', () => {
    expect(errOf('tile-type > 4')).toMatch(/== or !=/)
    expect(errOf('tile-type == 4')).toMatch(/shape name/)
  })

  it('parses the rotation attribute', () => {
    expect(ok('rotation == 90')).toMatchObject({ kind: 'compare', left: { kind: 'attr', name: 'rotation' } })
  })

  it('parses unary minus and grouping in expressions', () => {
    expect(parseExpr('-3').ok).toBe(true)
    const r = parseExpr('-(visited + 1)')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.kind).toBe('neg')
  })
})

describe('parse — defaults & indices', () => {
  it('requires an index on indexed attributes', () => {
    expect(errOf('coordinate == 1')).toMatch(/needs an index/)
    expect(ok('coordinate[0] default 0 == 1').kind).toBe('compare')
  })

  it('requires a default on attributes that may be absent', () => {
    expect(errOf('step[3] == 1')).toMatch(/add a default/)
    expect(errOf('first-step < 0')).toMatch(/add a default/)
    expect(ok('step[3] default 0 == 1')).toMatchObject({
      kind: 'compare',
      left: { kind: 'attr', name: 'step', index: 3, fallback: 0 },
    })
  })

  it('accepts a negative default', () => {
    expect(ok('latest-step default -1 < 0')).toMatchObject({
      kind: 'compare',
      left: { kind: 'attr', name: 'latest-step', fallback: -1 },
    })
  })

  it('rejects an index on a non-indexed attribute', () => {
    expect(errOf('visited[0] == 1')).toMatch(/does not take an index/)
  })
})

describe('parse — errors carry a message and span', () => {
  it('flags an unknown attribute', () => {
    const r = parsePredicate('frobnicate == 1')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.message).toMatch(/unknown attribute "frobnicate"/)
    expect(r.error.span).toEqual({ start: 0, end: 10 })
  })

  it('flags a missing comparison', () => {
    expect(errOf('visited')).toMatch(/expected a comparison/)
  })

  it('flags unbalanced parentheses', () => {
    expect(parsePredicate('(visited == 1').ok).toBe(false)
  })

  it('flags trailing tokens', () => {
    expect(errOf('visited == 1 garbage')).toMatch(/unexpected "garbage"/)
  })

  it('flags an unknown scope', () => {
    expect(errOf('visited of neighbor == 1')).toMatch(/expected "tile"/)
  })
})
