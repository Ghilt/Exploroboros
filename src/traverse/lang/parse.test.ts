import { describe, it, expect } from 'vitest'
import { predReadsTarget } from '../../dsl'
import { parseProgram } from './parse'

function ok(src: string) {
  const r = parseProgram(src)
  if (!r.ok) throw new Error(`expected parse ok, got: ${r.error.message}`)
  return r.value
}

describe('traverser DSL parser', () => {
  it('parses settings into the header', () => {
    const p = ok('max-split = 3\nheading = 90\nmovement = absolute\nmax-steps = 200\nmove straight')
    expect(p.settings).toEqual({ maxSplit: 3, heading: 90, movement: 'absolute', maxSteps: 200 })
    expect(p.statements).toHaveLength(1)
  })

  it('defaults the settings when omitted', () => {
    const p = ok('move straight')
    expect(p.settings).toEqual({ maxSplit: 1, movement: 'relative', maxSteps: 50000 })
  })

  it('parses a bare move and a guarded move', () => {
    const p = ok('move straight\nif visited > 0 then move l1')
    expect(p.statements[0]).toEqual({ kind: 'rule', action: { kind: 'move', target: [[{ kind: 'straight' }]] } })
    const r = p.statements[1]
    expect(r.kind).toBe('rule')
    if (r.kind === 'rule') {
      expect(r.guard?.pred.kind).toBe('inline')
      expect(r.action).toEqual({ kind: 'move', target: [[{ kind: 'turn', dir: 'l', n: 1 }]] })
    }
  })

  it('parses split sets and chains', () => {
    const p = ok('move [r1, l1]\nmove straight -> r2 -> e3')
    expect(p.statements[0]).toEqual({
      kind: 'rule',
      action: { kind: 'move', target: [[{ kind: 'turn', dir: 'r', n: 1 }], [{ kind: 'turn', dir: 'l', n: 1 }]] },
    })
    expect(p.statements[1]).toEqual({
      kind: 'rule',
      action: {
        kind: 'move',
        target: [[{ kind: 'straight' }, { kind: 'turn', dir: 'r', n: 2 }, { kind: 'edge', index: 3 }]],
      },
    })
  })

  it('parses a named-predicate guard', () => {
    const p = ok('if isCrowded then move l1')
    const r = p.statements[0]
    if (r.kind !== 'rule') throw new Error('expected rule')
    expect(r.guard).toEqual({ pred: { kind: 'named', name: 'isCrowded' } })
  })

  it('parses a guard composing two named references with and/or', () => {
    const p = ok('if isCrowded and Has_A then move l1')
    const r = p.statements[0]
    if (r.kind !== 'rule') throw new Error('expected rule')
    expect(r.guard?.pred).toEqual({
      kind: 'inline',
      pred: {
        kind: 'bool',
        op: 'and',
        left: { kind: 'predref', name: 'isCrowded' },
        right: { kind: 'predref', name: 'Has_A' },
      },
    })
  })

  it('parses an attribute @-path inside a guard (delegated to the predicate DSL)', () => {
    const p = ok('if visited@r1 > 0 then move l1')
    const r = p.statements[0]
    if (r.kind !== 'rule' || r.guard?.pred.kind !== 'inline') throw new Error('expected an inline rule guard')
    const pred = r.guard.pred.pred
    if (pred.kind !== 'compare' || pred.left.kind !== 'attr') throw new Error('expected a "visited@r1" comparison')
    expect(pred.left.name).toBe('visited')
    expect(pred.left.path).toEqual([{ kind: 'turn', dir: 'r', n: 1 }])
  })

  it('parses eN move edges', () => {
    const p = ok('move e0\nmove [e1, e2]')
    expect(p.statements[0]).toEqual({ kind: 'rule', action: { kind: 'move', target: [[{ kind: 'edge', index: 0 }]] } })
    expect(p.statements[1]).toEqual({
      kind: 'rule',
      action: { kind: 'move', target: [[{ kind: 'edge', index: 1 }], [{ kind: 'edge', index: 2 }]] },
    })
  })

  it('parses registry writes for tile (bracketed) and walker registries', () => {
    const p = ok('put [A] = visited + 1\nincrease P\nincrease Q by 2')
    expect(p.statements[0]).toMatchObject({ kind: 'rule', action: { kind: 'put', target: { kind: 'tile-reg', reg: 'a' } } })
    expect(p.statements[1]).toMatchObject({
      action: { kind: 'increase', target: { kind: 'walker-reg', reg: 'P' }, by: { expr: { kind: 'number', value: 1 } } },
    })
    expect(p.statements[2]).toMatchObject({ action: { kind: 'increase', target: { kind: 'walker-reg', reg: 'Q' } } })
  })

  it('parses an @-path on a tile-registry write (put/increase a neighbour)', () => {
    const p = ok('put [B@e1] = 1\nincrease [C@r1@e5] by 2')
    expect(p.statements[0]).toMatchObject({
      action: { kind: 'put', target: { kind: 'tile-reg', reg: 'b', path: [{ kind: 'edge', index: 1 }] } },
    })
    expect(p.statements[1]).toMatchObject({
      action: {
        kind: 'increase',
        target: { kind: 'tile-reg', reg: 'c', path: [{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'edge', index: 5 }] },
      },
    })
  })

  it('rejects a bare tile registry in a write, nudging to brackets', () => {
    const r = parseProgram('put A = 1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toContain('[A]')
    // [A, B] is a read-only sum; a write picks one registry
    expect(parseProgram('put [A, B] = 1').ok).toBe(false)
  })

  it('parses morph, update, directives and reset', () => {
    const p = ok(
      'morph spinner straight\nupdate max-split 4\ndirective if visited > 0 always forbid move\nreset directives',
    )
    expect(p.statements[0]).toEqual({ kind: 'rule', action: { kind: 'morph', def: 'spinner', target: [[{ kind: 'straight' }]] } })
    expect(p.statements[1]).toEqual({ kind: 'rule', action: { kind: 'update', setting: 'max-split', value: 4 } })
    expect(p.statements[2]).toMatchObject({ kind: 'directive', allow: false })
    expect(p.statements[3]).toEqual({ kind: 'reset' })
  })

  it('parses a directive with a @target attribute path (gate the destination)', () => {
    const p = ok('directive if visited@target > 0 always forbid move')
    const d = p.statements[0]
    expect(d.kind).toBe('directive')
    if (d.kind === 'directive') {
      expect(d.allow).toBe(false)
      expect(d.guard.pred.kind).toBe('inline')
      if (d.guard.pred.kind === 'inline') expect(predReadsTarget(d.guard.pred.pred)).toBe(true)
    }
  })

  it('parses a @target guard on a move rule', () => {
    const p = ok('if visited@target > 0 then move [r1, l1]')
    const r = p.statements[0]
    if (r.kind !== 'rule') throw new Error('expected rule')
    if (r.guard?.pred.kind === 'inline') expect(predReadsTarget(r.guard.pred.pred)).toBe(true)
    expect(r.action).toEqual({
      kind: 'move',
      target: [[{ kind: 'turn', dir: 'r', n: 1 }], [{ kind: 'turn', dir: 'l', n: 1 }]],
    })
  })

  it('reports an error for a directive missing the always/move tail', () => {
    expect(parseProgram('directive if visited > 0 forbid move').ok).toBe(false)
    expect(parseProgram('directive if visited > 0 always forbid').ok).toBe(false)
  })

  it('ignores comments and blank lines', () => {
    const p = ok('# a walker\n\nmove straight   # go forward\n')
    expect(p.statements).toHaveLength(1)
  })

  it('reports an error with a span for a bad edge', () => {
    const r = parseProgram('move sideways')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.span.start).toBeGreaterThan(0)
  })

  it('reports an error for a guard with no then', () => {
    const r = parseProgram('if visited > 0 move straight')
    expect(r.ok).toBe(false)
  })
})
