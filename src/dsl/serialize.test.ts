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
    expect(canon('registry-a>0 and visited==1')).toBe('registry-a > 0 and visited == 1')
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

  it('inserts parentheses only where precedence needs them', () => {
    expect(canon('(visited == 1 or visited == 2) and registry-a == 3')).toBe(
      '(visited == 1 or visited == 2) and registry-a == 3',
    )
    // and binds tighter than or, so no parens needed here
    expect(canon('visited == 1 or visited == 2 and registry-a == 3')).toBe(
      'visited == 1 or visited == 2 and registry-a == 3',
    )
    expect(canon('not (visited == 1 and registry-a == 2)')).toBe('not (visited == 1 and registry-a == 2)')
  })
})

describe('serialize — round-trips through parse', () => {
  const samples = [
    'visited > 0',
    'visited % 2 == 1 and registry-a > 0',
    '(visited == 1 or visited == 2) and registry-a == 3',
    'not visited == 0',
    'coordinate[0] default 0 + coordinate[1] default 0 == 2',
    'step[3] default 0 != latest-step default 0',
    '-edge-count < 0',
    '(1 + 2) * 3 == 9',
    'tile-type == wedge',
    'tile-type != triangle and visited > 0',
    'rotation == 90 or tile-type == square',
  ]
  for (const src of samples) {
    it(`parse(serialize(parse(${src}))) is stable`, () => {
      const once = tree(src)
      const twice = tree(canon(src))
      expect(twice).toEqual(once)
    })
  }
})
