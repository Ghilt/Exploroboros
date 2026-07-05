import { describe, it, expect } from 'vitest'
import { squareTiling, nodeById, type TileNode } from '../tiling'
import { bumpRegistry, type TileState } from '../canvas'
import { parseExpr, parsePredicate } from './parse'
import { serialize } from './serialize'
import { evalNumber, evalPredicate } from './eval'
import { predReadsTarget } from './target'
import type { EvalContext } from './attributes'

type Overlay = ReadonlyMap<string, TileState>
const sq = squareTiling(3, 3)

function ctxFor(id: string, overlay: Overlay = new Map()): EvalContext {
  const node = nodeById(sq, id)
  if (!node) throw new Error(`no tile ${id}`)
  return { node, tiling: sq, overlay, indexById: new Map() }
}
function num(src: string, ctx: EvalContext): number {
  const r = parseExpr(src)
  if (!r.ok) throw new Error(r.error.message)
  return evalNumber(r.value, ctx)
}
function pred(src: string, ctx: EvalContext): boolean {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(r.error.message)
  return evalPredicate(r.value, ctx)
}
function predErr(src: string): string {
  const r = parsePredicate(src)
  if (r.ok) throw new Error(`expected a parse error for ${src}`)
  return r.error.message
}
function exprErr(src: string): string {
  const r = parseExpr(src)
  if (r.ok) throw new Error(`expected a parse error for ${src}`)
  return r.error.message
}
function canon(src: string): string {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(r.error.message)
  return serialize(r.value)
}

describe('lists — parse & serialize (round-trip)', () => {
  it('[A] / [A, B] stay byte-stable; :sum is the omitted default', () => {
    expect(canon('[A] > 0')).toBe('[A] > 0')
    expect(canon('[A, B] == 2')).toBe('[A, B] == 2')
    expect(canon('[A, B]:sum == 2')).toBe('[A, B] == 2')
  })
  it('keeps a non-default numeric reducer', () => {
    expect(canon('[visited@e1, A@e3]:avg == 1')).toBe('[visited@e1, A@e3]:avg == 1')
    expect(canon('[A, B]:min > 3')).toBe('[A, B]:min > 3')
    expect(canon('[A, B]:max > 3')).toBe('[A, B]:max > 3')
  })
  it('serializes boolean-reduced numeric and shape lists', () => {
    expect(canon('[visited@e1, A@e3]:all == 1')).toBe('[visited@e1, A@e3]:all == 1')
    expect(canon('[visited@e1, A@e3]:any == 1')).toBe('[visited@e1, A@e3]:any == 1')
    expect(canon('[visited@e1, A@e3]:xor == 1')).toBe('[visited@e1, A@e3]:xor == 1')
    expect(canon('[tile-type@r1, tile-type@r2]:xor == octagon')).toBe('[tile-type@r1, tile-type@r2]:xor == octagon')
  })
})

describe('lists — invalid cases (owner spec)', () => {
  it('cannot mix tile-type with numeric values', () => {
    expect(predErr('[tile-type@e1, A@e3]:xor == 1')).toMatch(/mix tile-type/)
  })
  it('a boolean reducer needs a comparison (never yields a number)', () => {
    expect(exprErr('[A, B]:all')).toMatch(/comparison|left/)
  })
  it('tile-type values cannot be summed (numeric reducer on a shape list)', () => {
    expect(exprErr('[tile-type@r1, tile-type@r2]:sum')).toMatch(/tile-type|boolean reducer/)
  })
  it('a bare direction is not a value inside a list', () => {
    expect(predErr('[r1]:sum == 1')).toMatch(/direction/)
    expect(predErr('[r1, r1, r1]:sum == 1')).toMatch(/direction/)
  })
})

describe('lists — numeric eval', () => {
  it('sum default, avg ceils, min/max pick', () => {
    let ov: Overlay = new Map()
    ov = bumpRegistry(ov, 'sq:1,1', 'a', 1)
    ov = bumpRegistry(ov, 'sq:1,1', 'b', 4)
    ov = bumpRegistry(ov, 'sq:1,1', 'c', 2)
    const ctx = ctxFor('sq:1,1', ov)
    expect(num('[A, B, C]', ctx)).toBe(7)
    expect(num('[A, B, C]:sum', ctx)).toBe(7)
    expect(num('[A, B, C]:avg', ctx)).toBe(3) // ceil(7/3)
    expect(num('[A, B, C]:min', ctx)).toBe(1)
    expect(num('[A, B, C]:max', ctx)).toBe(4)
  })
})

describe('lists — boolean-reduced eval', () => {
  const ctx = () => {
    let ov: Overlay = new Map()
    ov = bumpRegistry(ov, 'sq:1,1', 'a', 1)
    ov = bumpRegistry(ov, 'sq:1,1', 'b', 1)
    ov = bumpRegistry(ov, 'sq:1,1', 'c', 0)
    return ctxFor('sq:1,1', ov)
  }
  it('all / any / none / xor apply the comparison per element', () => {
    expect(pred('[A, B]:all == 1', ctx())).toBe(true)
    expect(pred('[A, B, C]:all == 1', ctx())).toBe(false)
    expect(pred('[A, C]:any == 1', ctx())).toBe(true)
    expect(pred('[C]:any == 1', ctx())).toBe(false)
    expect(pred('[A, C]:xor == 1', ctx())).toBe(true) // exactly one
    expect(pred('[A, B]:xor == 1', ctx())).toBe(false) // two match → not exactly one
    expect(pred('[C]:none == 1', ctx())).toBe(true)
    expect(pred('[A, C]:none == 1', ctx())).toBe(false)
  })
})

describe('lists — shape-reduced eval', () => {
  // Stub the path resolver: r1 → an octagon, r2 → a square (only .shape is read by shapecmp).
  const fake = (shape: string) => ({ shape }) as unknown as TileNode
  const ctx: EvalContext = {
    node: nodeById(sq, 'sq:1,1')!,
    tiling: sq,
    overlay: new Map(),
    indexById: new Map(),
    nodeForPath: (path) => {
      const seg = path[0]
      if (seg?.kind === 'turn' && seg.n === 1) return fake('octagon')
      if (seg?.kind === 'turn' && seg.n === 2) return fake('square')
      return null
    },
  }
  it('xor = exactly one tile has the shape; all/any as expected', () => {
    expect(pred('[tile-type@r1, tile-type@r2]:xor == octagon', ctx)).toBe(true) // only r1
    expect(pred('[tile-type@r1, tile-type@r2]:any == octagon', ctx)).toBe(true)
    expect(pred('[tile-type@r1, tile-type@r2]:all == octagon', ctx)).toBe(false)
    expect(pred('[tile-type@r1, tile-type@r2]:none == octagon', ctx)).toBe(false)
  })
})

describe('lists — @target detection', () => {
  it('a @target inside a list marks the guard as per-target', () => {
    const r = parsePredicate('[visited@target, A]:any == 1')
    if (!r.ok) throw new Error(r.error.message)
    expect(predReadsTarget(r.value)).toBe(true)
  })
  it('a list with no @target does not', () => {
    const r = parsePredicate('[visited@e1, A]:any == 1')
    if (!r.ok) throw new Error(r.error.message)
    expect(predReadsTarget(r.value)).toBe(false)
  })
})
