import { describe, it, expect } from 'vitest'
import { parseDoc } from './parse'
import { serializeDoc } from './serialize'
import { compileDoc } from './compile'
import type { Doc } from './types'

function ok(src: string): Doc {
  const r = parseDoc(src)
  if (!r.ok) throw new Error(`expected parse ok, got: ${r.error.message}`)
  return r.value
}

describe('initstate parse', () => {
  it('parses a line placing a traverser by number', () => {
    const d = ok('auto-place line {t1, 0, 0, 0}')
    expect(d).toHaveLength(1)
    expect(d[0]).toEqual({
      shape: { kind: 'line', angle: 0, percent: 0 },
      what: { kind: 'traverser', ref: 't1' },
      param: 0,
      guard: undefined,
    })
  })

  it('parses a line placing a registry, with an inline guard', () => {
    const d = ok('auto-place line {[A], 0, 0, 5} if tile-type == octagon')
    expect(d[0].what).toEqual({ kind: 'reg', reg: 'a' })
    expect(d[0].param).toBe(5)
    expect(d[0].guard?.pred.kind).toBe('inline')
  })

  it('parses a blob: {what, x, y, radius, param}', () => {
    const d = ok('auto-place blob {[C], 50, 50, 2, 7}')
    expect(d[0]).toEqual({
      shape: { kind: 'blob', x: 50, y: 50, radius: 2 },
      what: { kind: 'reg', reg: 'c' },
      param: 7,
      guard: undefined,
    })
  })

  it('parses visited and a negative angle', () => {
    const d = ok('auto-place line {visited, -45, 50, 3}')
    expect(d[0].what).toEqual({ kind: 'visited' })
    expect(d[0].shape).toEqual({ kind: 'line', angle: -45, percent: 50 })
    expect(d[0].param).toBe(3)
  })

  it('parses a traverser by name and a named-predicate guard, resolved by compile', () => {
    const d = ok('auto-place blob {walker, 0, 0, 1, 0} if isOct')
    expect(d[0].what).toEqual({ kind: 'traverser', ref: 'walker' })
    expect(d[0].guard).toEqual({ pred: { kind: 'named', name: 'isOct' } })
    const c = compileDoc('auto-place blob {walker, 0, 0, 1, 0} if isOct', new Map([['isOct', 'tile-type == octagon']]))
    if (!c.ok) throw new Error(c.error.message)
    expect(c.value[0].guard?.pred.kind).toBe('inline')
  })

  it('composes named-predicate references inside a guard', () => {
    const d = ok('auto-place blob {walker, 0, 0, 1, 0} if isOct and Has_A')
    expect(d[0].guard?.pred).toEqual({
      kind: 'inline',
      pred: {
        kind: 'bool',
        op: 'and',
        left: { kind: 'predref', name: 'isOct' },
        right: { kind: 'predref', name: 'Has_A' },
      },
    })
    const names = new Map([
      ['isOct', 'tile-type == octagon'],
      ['Has_A', '[A] > 0'],
    ])
    const c = compileDoc('auto-place blob {walker, 0, 0, 1, 0} if isOct and Has_A', names)
    if (!c.ok) throw new Error(c.error.message)
    expect(c.value[0].guard?.pred).toEqual({
      kind: 'inline',
      pred: {
        kind: 'bool',
        op: 'and',
        left: { kind: 'shape', op: '==', shape: 'octagon' },
        right: { kind: 'compare', op: '>', left: { kind: 'list', reducer: 'sum', elems: [{ kind: 'regterm', reg: 'a' }] }, right: { kind: 'number', value: 0 } },
      },
    })
  })

  it('fails to compile on an unknown or self-referencing predicate name', () => {
    const ghost = compileDoc('auto-place blob {walker, 0, 0, 1, 0} if ghost', new Map())
    expect(ghost.ok).toBe(false)
    if (!ghost.ok) expect(ghost.error.message).toMatch(/unknown predicate "ghost"/)

    const loop = compileDoc('auto-place blob {walker, 0, 0, 1, 0} if loop', new Map([['loop', 'loop']]))
    expect(loop.ok).toBe(false)
    if (!loop.ok) expect(loop.error.message).toMatch(/refers to itself/)
  })

  it('round-trips through serialize (line + blob, with and without a guard)', () => {
    for (const src of [
      'auto-place line {t1, 0, 0, 0}',
      'auto-place line {[A], -45, 50, 2} if tile-type == octagon',
      'auto-place blob {visited, 50, 50, 3, 1}',
      'auto-place line {t2, 0, 100, 4}\nauto-place blob {[B], 25, 75, 2, 9}',
    ]) {
      const once = serializeDoc(ok(src))
      const twice = serializeDoc(ok(once))
      expect(twice).toBe(once)
    }
  })

  it('reports errors for a malformed spec or unknown shape', () => {
    expect(parseDoc('auto-place line {t1, 0, 0}').ok).toBe(false) // line needs 3 numbers
    expect(parseDoc('auto-place blob {[A], 0, 0, 0}').ok).toBe(false) // blob needs 4 numbers
    expect(parseDoc('auto-place circle {t1, 0, 0, 0}').ok).toBe(false) // unknown shape
    expect(parseDoc('auto-place line t1, 0, 0, 0').ok).toBe(false) // missing braces
    expect(parseDoc('auto-place line {[Z], 0, 0, 0}').ok).toBe(false) // not a registry
  })

  it('a short spec names the shape template (not a cryptic "expected \\",\\"")', () => {
    const blob = parseDoc('auto-place blob {[A], 50, 100, 1}') // one value short
    expect(blob.ok).toBe(false)
    if (!blob.ok) expect(blob.error.message).toBe('blob takes {what, x%, y%, radius, param}')
    const line = parseDoc('auto-place line {t1, 0, 100}') // one value short
    expect(line.ok).toBe(false)
    if (!line.ok) expect(line.error.message).toBe('line takes {what, angle, percent, param}')
  })
})
