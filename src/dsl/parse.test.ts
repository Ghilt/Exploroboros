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
        left: { kind: 'list', reducer: 'sum', elems: [{ kind: 'regterm', reg: 'a' }] },
        right: { kind: 'number', value: 0 },
      },
    })
  })

  it('parses a registry read [A] and a sum [A, B]', () => {
    expect(ok('[A] > 0')).toEqual({
      kind: 'compare',
      op: '>',
      left: { kind: 'list', reducer: 'sum', elems: [{ kind: 'regterm', reg: 'a' }] },
      right: { kind: 'number', value: 0 },
    })
    expect(ok('[A, b] == 2')).toEqual({
      kind: 'compare',
      op: '==',
      left: { kind: 'list', reducer: 'sum', elems: [{ kind: 'regterm', reg: 'a' }, { kind: 'regterm', reg: 'b' }] },
      right: { kind: 'number', value: 2 },
    })
  })

  it('parses a BARE registry read A (no brackets needed)', () => {
    expect(ok('A > 0')).toEqual({
      kind: 'compare',
      op: '>',
      left: { kind: 'regterm', reg: 'a' },
      right: { kind: 'number', value: 0 },
    })
    // a bare registry with an @-path reads a neighbour's registry
    expect(ok('A@e1 == 2')).toMatchObject({
      kind: 'compare',
      left: { kind: 'regterm', reg: 'a', path: [{ kind: 'edge', index: 1 }] },
    })
    // `A` alone (no comparison) is a value, so it reports "expected a comparison" — not "unknown predicate"
    expect(errOf('A')).toMatch(/comparison/)
  })

  it('parses exists@path — requires a path, rejects a bare exists', () => {
    expect(ok('exists@f0')).toEqual({ kind: 'exists', path: [{ kind: 'found', index: 0 }] })
    expect(ok('exists@e0')).toEqual({ kind: 'exists', path: [{ kind: 'edge', index: 0 }] })
    expect(ok('exists@r1@e5')).toEqual({
      kind: 'exists',
      path: [{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'edge', index: 5 }],
    })
    expect(errOf('exists')).toMatch(/needs a path/)
  })

  it('composes exists@path with and/or/not', () => {
    expect(ok('exists@f0 and not exists@f1')).toEqual({
      kind: 'bool',
      op: 'and',
      left: { kind: 'exists', path: [{ kind: 'found', index: 0 }] },
      right: { kind: 'not', operand: { kind: 'exists', path: [{ kind: 'found', index: 1 }] } },
    })
  })

  it('parses a found-tile reference @fN in a path (base only)', () => {
    expect(ok('tile-type@f1 == wedge')).toMatchObject({ kind: 'shape', shape: 'wedge', path: [{ kind: 'found', index: 1 }] })
    // @fN may lead a chain of edge hops
    expect(ok('visited@f0@e2 > 0')).toMatchObject({
      kind: 'compare',
      left: { kind: 'attr', name: 'visited', path: [{ kind: 'found', index: 0 }, { kind: 'edge', index: 2 }] },
    })
    // …but never sit after another hop
    expect(errOf('visited@e0@f1 > 0')).toMatch(/first hop/)
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

describe('parse — attribute @-paths', () => {
  it('parses an edge hop on an attribute', () => {
    expect(ok('visited@e1 == 0')).toEqual({
      kind: 'compare',
      op: '==',
      left: { kind: 'attr', name: 'visited', scope: 'tile', path: [{ kind: 'edge', index: 1 }] },
      right: { kind: 'number', value: 0 },
    })
  })

  it('parses a multi-hop path of chained edges', () => {
    const p = ok('visited@e0@e0@e3 > 0')
    if (p.kind !== 'compare' || p.left.kind !== 'attr') throw new Error('expected an attr comparison')
    expect(p.left.path).toEqual([
      { kind: 'edge', index: 0 },
      { kind: 'edge', index: 0 },
      { kind: 'edge', index: 3 },
    ])
  })

  it('parses turns, straight and nearest-unvisited segments', () => {
    const p = ok('visited@r1@e5 == 1')
    if (p.kind !== 'compare' || p.left.kind !== 'attr') throw new Error('expected an attr comparison')
    expect(p.left.path).toEqual([{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'edge', index: 5 }])
    const q = ok('visited@straight > 0')
    if (q.kind !== 'compare' || q.left.kind !== 'attr') throw new Error('expected an attr comparison')
    expect(q.left.path).toEqual([{ kind: 'straight' }])
    const u = ok('visited@nearest-unvisited > 0')
    if (u.kind !== 'compare' || u.left.kind !== 'attr') throw new Error('expected an attr comparison')
    expect(u.left.path).toEqual([{ kind: 'unvisited' }])
  })

  it('parses a path on a registry read, inside the brackets', () => {
    const p = ok('[A@r1] == 2')
    if (p.kind !== 'compare' || p.left.kind !== 'list') throw new Error('expected a list comparison')
    expect(p.left).toEqual({ kind: 'list', reducer: 'sum', elems: [{ kind: 'regterm', reg: 'a', path: [{ kind: 'turn', dir: 'r', n: 1 }] }] })
  })

  it('parses a path on a tile-type test', () => {
    expect(ok('tile-type@e0 == wedge')).toEqual({ kind: 'shape', op: '==', shape: 'wedge', path: [{ kind: 'edge', index: 0 }] })
  })

  it('parses the terminal @target and @tile N', () => {
    const t = ok('visited@target == 0')
    if (t.kind !== 'compare' || t.left.kind !== 'attr') throw new Error('expected an attr comparison')
    expect(t.left.path).toEqual([{ kind: 'target' }])
    const n = ok('visited@tile 5 == 0')
    if (n.kind !== 'compare' || n.left.kind !== 'attr') throw new Error('expected an attr comparison')
    expect(n.left.path).toEqual([{ kind: 'tile', index: 5 }])
  })

  it('rejects a bare number after @ (edges are @eN)', () => {
    expect(errOf('visited@1 == 0')).toContain('@')
  })

  it('rejects a hop after a terminal target/tile', () => {
    expect(errOf('visited@target@e1 == 0')).toMatch(/only hop/)
    expect(errOf('visited@tile 5@e1 == 0')).toMatch(/only hop/)
  })

  it('rejects a path on a walker (traverser-scoped) attribute', () => {
    expect(errOf('heading@e1 == 0')).toMatch(/walker/)
    expect(errOf('steps@e1 == 0')).toMatch(/walker/)
  })

  it('rejects an unknown path segment', () => {
    expect(errOf('visited@bogus == 0')).toMatch(/not an edge|edge after/)
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

describe('parse — named-predicate references (predref)', () => {
  it('parses a bare name as a predref leaf', () => {
    expect(ok('isCrowded')).toEqual({ kind: 'predref', name: 'isCrowded' })
  })

  it('parses an underscore/digit name (Has_A, Level_2) as a predref leaf', () => {
    expect(ok('Has_A')).toEqual({ kind: 'predref', name: 'Has_A' })
    expect(ok('Level_2')).toEqual({ kind: 'predref', name: 'Level_2' })
  })

  it('composes refs with and/or/not', () => {
    expect(ok('isCrowded and Has_A')).toEqual({
      kind: 'bool',
      op: 'and',
      left: { kind: 'predref', name: 'isCrowded' },
      right: { kind: 'predref', name: 'Has_A' },
    })
    expect(ok('not isCrowded')).toEqual({ kind: 'not', operand: { kind: 'predref', name: 'isCrowded' } })
    expect(ok('isCrowded or hasC')).toMatchObject({ kind: 'bool', op: 'or' })
  })

  it('mixes a predref with a real comparison', () => {
    expect(ok('visited > 0 and isCrowded')).toEqual({
      kind: 'bool',
      op: 'and',
      left: { kind: 'compare', op: '>', left: expect.anything(), right: expect.anything() },
      right: { kind: 'predref', name: 'isCrowded' },
    })
  })

  it('accepts a lone reference wrapped in parens', () => {
    expect(ok('(isCrowded)')).toEqual({ kind: 'pgroup', inner: { kind: 'predref', name: 'isCrowded' } })
    expect(ok('(Has_A)')).toEqual({ kind: 'pgroup', inner: { kind: 'predref', name: 'Has_A' } })
    expect(ok('(not isCrowded)')).toEqual({
      kind: 'pgroup',
      inner: { kind: 'not', operand: { kind: 'predref', name: 'isCrowded' } },
    })
  })

  it('still requires a comparison for a real attribute name (unaffected)', () => {
    expect(errOf('visited')).toMatch(/expected a comparison/)
  })

  it('still requires a shape name after tile-type (unaffected by the predref lookahead)', () => {
    expect(parsePredicate('tile-type == wedge').ok).toBe(true)
  })
})
