import { describe, it, expect } from 'vitest'
import { parsePredicate } from './parse'
import { serialize } from './serialize'
import type { Expr, Pred } from './types'

function canon(src: string): string {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(`parse failed: ${r.error.message}`)
  return serialize(r.value)
}

// Strip Group/PredGroup wrappers so round-trip equality ignores redundant parens.
function nExpr(e: Expr): Expr {
  switch (e.kind) {
    case 'group':
      return nExpr(e.inner)
    case 'neg':
      return { kind: 'neg', operand: nExpr(e.operand) }
    case 'bin':
      return { kind: 'bin', op: e.op, left: nExpr(e.left), right: nExpr(e.right) }
    default:
      return e
  }
}
function nPred(p: Pred): Pred {
  switch (p.kind) {
    case 'pgroup':
      return nPred(p.inner)
    case 'not':
      return { kind: 'not', operand: nPred(p.operand) }
    case 'bool':
      return { kind: 'bool', op: p.op, left: nPred(p.left), right: nPred(p.right) }
    case 'compare':
      return { kind: 'compare', op: p.op, left: nExpr(p.left), right: nExpr(p.right) }
    case 'shape':
    case 'predref':
    case 'listcmp':
    case 'shapecmp':
      return p
  }
}
function tree(src: string): Pred {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(`parse failed: ${r.error.message}`)
  return nPred(r.value)
}

describe('serialize — canonical text', () => {
  it('spaces operators consistently', () => {
    expect(canon('visited%2==1')).toBe('visited % 2 == 1')
    expect(canon('[A]>0 and visited==1')).toBe('[A] > 0 and visited == 1')
    expect(canon('[a, b] == 0')).toBe('[A, B] == 0')
  })

  it('drops redundant parentheses and the implicit "of tile"', () => {
    expect(canon('( visited == 4 )')).toBe('visited == 4')
    expect(canon('visited of tile == 4')).toBe('visited == 4')
  })

  it('keeps an index and default, including a negative default', () => {
    expect(canon('step[3] default 0 == 1')).toBe('step[3] default 0 == 1')
    expect(canon('first-step default -1 < 0')).toBe('first-step default -1 < 0')
  })

  it('serializes a tile-type test, dropping the implicit "of tile"', () => {
    expect(canon('tile-type==wedge')).toBe('tile-type == wedge')
    expect(canon('tile-type of tile != triangle')).toBe('tile-type != triangle')
  })

  it('serializes attribute @-paths (edge hops, target, tile)', () => {
    expect(canon('visited@e1 == 0')).toBe('visited@e1 == 0')
    expect(canon('visited@e0@e0@e3 > 0')).toBe('visited@e0@e0@e3 > 0')
    expect(canon('visited@r1@e5 == 1')).toBe('visited@r1@e5 == 1')
    expect(canon('[A@r1] == 2')).toBe('[A@r1] == 2')
    expect(canon('tile-type@e0 == wedge')).toBe('tile-type@e0 == wedge')
    expect(canon('visited@target == 0')).toBe('visited@target == 0')
    expect(canon('visited@tile 5 == 0')).toBe('visited@tile 5 == 0')
    expect(canon('visited@nearest-unvisited > 0')).toBe('visited@nearest-unvisited > 0')
  })

  it('inserts parentheses only where precedence needs them', () => {
    expect(canon('(visited == 1 or visited == 2) and [A] == 3')).toBe(
      '(visited == 1 or visited == 2) and [A] == 3',
    )
    // and binds tighter than or, so no parens needed here
    expect(canon('visited == 1 or visited == 2 and [A] == 3')).toBe(
      'visited == 1 or visited == 2 and [A] == 3',
    )
    expect(canon('not (visited == 1 and [A] == 2)')).toBe('not (visited == 1 and [A] == 2)')
  })

  it('serializes a named-predicate reference bare (names are always valid identifiers)', () => {
    expect(canon('isCrowded')).toBe('isCrowded')
    expect(canon('has-a')).toBe('has-a') // hyphenated is one lexer token
    expect(canon('Has_A')).toBe('Has_A') // underscore-joined
    expect(canon('isCrowded and Has_A')).toBe('isCrowded and Has_A')
  })
})

describe('serialize — round-trips through parse', () => {
  const samples = [
    'visited > 0',
    'visited % 2 == 1 and [A] > 0',
    '(visited == 1 or visited == 2) and [A] == 3',
    '[A, B, C] > 0',
    'not visited == 0',
    'coordinate[0] default 0 + coordinate[1] default 0 == 2',
    'step[3] default 0 != latest-step default 0',
    '-edge-count < 0',
    '(1 + 2) * 3 == 9',
    'tile-type == wedge',
    'tile-type != triangle and visited > 0',
    'rotation == 90 or tile-type == square',
    'visited@e1 == 0',
    'visited@e0@e0@e3 > 0',
    'visited@r1@e5 == 1',
    '[A@r1] == 2',
    'tile-type@e0 == wedge',
    'visited@target == 0 and visited@e1 > 0',
    'isCrowded',
    'Has_A',
    'isCrowded and Has_A',
    'not Has_A',
    '(isCrowded)',
    'visited > 0 and isCrowded',
  ]
  for (const src of samples) {
    it(`parse(serialize(parse(${src}))) is stable`, () => {
      const once = tree(src)
      const twice = tree(canon(src))
      expect(twice).toEqual(once)
    })
  }
})
