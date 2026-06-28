import { describe, it, expect } from 'vitest'
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
    const p = ok('move [r1, l1]\nmove straight -> r2 -> edge 3')
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

  it('parses a named-predicate guard with edge decoration', () => {
    const p = ok('if isCrowded @ r1 then move l1')
    const r = p.statements[0]
    if (r.kind !== 'rule') throw new Error('expected rule')
    expect(r.guard).toEqual({ pred: { kind: 'named', name: 'isCrowded' }, at: { kind: 'edge', edge: { kind: 'turn', dir: 'r', n: 1 } } })
  })

  it('parses registry writes for tile and traverser registries', () => {
    const p = ok('put A = visited + 1\nincrease P\nincrease Q by 2')
    expect(p.statements[0]).toMatchObject({ kind: 'rule', action: { kind: 'put', reg: 'A' } })
    expect(p.statements[1]).toMatchObject({ action: { kind: 'increase', reg: 'P', by: { expr: { kind: 'number', value: 1 } } } })
    expect(p.statements[2]).toMatchObject({ action: { kind: 'increase', reg: 'Q' } })
  })

  it('parses morph, update, directives and reset', () => {
    const p = ok(
      'morph spinner straight\nupdate max-split 4\ndirective move always forbid if visited > 0\nreset directives',
    )
    expect(p.statements[0]).toEqual({ kind: 'rule', action: { kind: 'morph', def: 'spinner', target: [[{ kind: 'straight' }]] } })
    expect(p.statements[1]).toEqual({ kind: 'rule', action: { kind: 'update', setting: 'max-split', value: 4 } })
    expect(p.statements[2].kind).toBe('directive')
    expect(p.statements[3]).toEqual({ kind: 'reset' })
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
