// Tests for resolveGuard's named-predicate resolution — the whole-bare-word guard AND any reference
// embedded inside a compound guard (composability), matching src/dsl's resolvePredRefs contract.

import { describe, it, expect } from 'vitest'
import { compileProgram } from './compile'

describe('compileProgram — named-predicate resolution', () => {
  it('resolves a bare single-name guard to inline', () => {
    const names = new Map([['isCrowded', 'visited-neighbors > 2']])
    const c = compileProgram('if isCrowded then move l1', names)
    if (!c.ok) throw new Error(c.error.message)
    const r = c.value.statements[0]
    if (r.kind !== 'rule') throw new Error('expected rule')
    expect(r.guard?.pred).toEqual({ kind: 'inline', pred: { kind: 'compare', op: '>', left: expect.anything(), right: expect.anything() } })
  })

  it('resolves references composed with and/or inside a guard', () => {
    const names = new Map([
      ['hasA', '[A] > 0'],
      ['hasC', '[C] > 0'],
    ])
    const c = compileProgram('if hasA and hasC then move l1', names)
    if (!c.ok) throw new Error(c.error.message)
    const r = c.value.statements[0]
    if (r.kind !== 'rule' || r.guard?.pred.kind !== 'inline') throw new Error('expected an inline rule guard')
    expect(r.guard.pred.pred).toEqual({
      kind: 'bool',
      op: 'and',
      left: { kind: 'compare', op: '>', left: { kind: 'list', reducer: 'sum', elems: [{ kind: 'regterm', reg: 'a' }] }, right: { kind: 'number', value: 0 } },
      right: { kind: 'compare', op: '>', left: { kind: 'list', reducer: 'sum', elems: [{ kind: 'regterm', reg: 'c' }] }, right: { kind: 'number', value: 0 } },
    })
  })

  it('resolves an underscore-joined name', () => {
    const names = new Map([['Has_A', '[A] > 0']])
    const c = compileProgram('if Has_A then move l1', names)
    if (!c.ok) throw new Error(c.error.message)
    const r = c.value.statements[0]
    if (r.kind !== 'rule' || r.guard?.pred.kind !== 'inline') throw new Error('expected an inline rule guard')
    expect(r.guard.pred.pred).toEqual({
      kind: 'compare',
      op: '>',
      left: { kind: 'list', reducer: 'sum', elems: [{ kind: 'regterm', reg: 'a' }] },
      right: { kind: 'number', value: 0 },
    })
  })

  it('fails to compile on an unknown reference', () => {
    const c = compileProgram('if ghost then move l1', new Map())
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.message).toMatch(/unknown predicate "ghost"/)
  })

  it('fails to compile on an unknown reference embedded in a compound guard', () => {
    const names = new Map([['hasA', '[A] > 0']])
    const c = compileProgram('if hasA and ghost then move l1', names)
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.message).toMatch(/unknown predicate "ghost"/)
  })

  it('fails to compile on a self-referencing cycle', () => {
    const names = new Map([['loop', 'loop']])
    const c = compileProgram('if loop then move l1', names)
    expect(c.ok).toBe(false)
    if (c.ok) return
    expect(c.error.message).toMatch(/refers to itself/)
  })

  it('resolves a named guard INSIDE an if-block body', () => {
    const names = new Map([['isCrowded', 'visited-neighbors > 2']])
    const c = compileProgram('if visited > 0 {\n  if isCrowded then move l1\n}', names)
    if (!c.ok) throw new Error(c.error.message)
    const block = c.value.statements[0]
    if (block.kind !== 'if-block') throw new Error('expected an if-block')
    const inner = block.body[0]
    if (inner.kind !== 'rule') throw new Error('expected a rule in the block body')
    expect(inner.guard?.pred).toMatchObject({ kind: 'inline', pred: { kind: 'compare', op: '>' } })
  })

  it('preserves the else branch of an if-block through compilation', () => {
    const c = compileProgram('if visited == 0 {\n  move e0\n} else {\n  move e1\n}', new Map())
    if (!c.ok) throw new Error(c.error.message)
    const block = c.value.statements[0]
    if (block.kind !== 'if-block') throw new Error('expected an if-block')
    expect(block.elseBody?.map((s) => s.kind)).toEqual(['rule'])
  })

  it('resolves named predicates inside else and else-if branches', () => {
    const names = new Map([
      ['isGoal', 'visited == 0'],
      ['isCrowded', 'visited-neighbors > 2'],
    ])
    // if A == 1 {…} else if isGoal {…} else { if isCrowded then move e2 } — the named refs live only in
    // the else-if guard and the final else's inner rule, so this fails unless resolveNames reaches them.
    const c = compileProgram('if A == 1 {\n  move e0\n} else if isGoal {\n  move e1\n} else {\n  if isCrowded then move e2\n}', names)
    if (!c.ok) throw new Error(c.error.message)
    const outer = c.value.statements[0]
    if (outer.kind !== 'if-block' || !outer.elseBody) throw new Error('expected an if-block with an else')
    const elseIf = outer.elseBody[0]
    if (elseIf.kind !== 'if-block' || !elseIf.elseBody) throw new Error('expected a nested else-if block with an else')
    expect(elseIf.guard.pred).toMatchObject({ kind: 'inline', pred: { kind: 'compare', op: '==' } }) // isGoal resolved
    const finalElse = elseIf.elseBody[0]
    if (finalElse.kind !== 'rule') throw new Error('expected a rule in the final else')
    expect(finalElse.guard?.pred).toMatchObject({ kind: 'inline', pred: { kind: 'compare', op: '>' } }) // isCrowded resolved
  })

  it('fails to compile an unknown reference inside an else branch', () => {
    // Proves resolution truly reaches the else branch: a bad ref there must error, not be silently dropped.
    const c = compileProgram('if visited > 0 {\n  move e0\n} else {\n  if ghost then move e1\n}', new Map())
    expect(c.ok).toBe(false)
    if (!c.ok) expect(c.error.message).toMatch(/unknown predicate "ghost"/)
  })

  it('resolves a named predicate in a find-tile goal + body guard', () => {
    const names = new Map([['isGoal', 'visited == 0'], ['open', 'visited-neighbors < 3']])
    const c = compileProgram('find-tile isGoal {\n  if open then move nearest-unvisited\n}\nmove f0', names)
    if (!c.ok) throw new Error(c.error.message)
    const f = c.value.statements[0]
    if (f.kind !== 'find-tile') throw new Error('expected a find-tile')
    expect(f.find.pred.pred).toMatchObject({ kind: 'inline' })
    expect(f.find.body[0].guard?.pred).toMatchObject({ kind: 'inline' })
  })

  it('fails to compile an unknown reference inside a find-tile', () => {
    const c = compileProgram('find-tile ghost {\n  move straight\n}\nmove f0', new Map())
    expect(c.ok).toBe(false)
    if (!c.ok) expect(c.error.message).toMatch(/unknown predicate "ghost"/)
  })
})
