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
    expect(p.settings).toEqual({ maxSplit: 1, movement: 'relative', maxSteps: 1_000_000 })
  })

  it('parses a bare move and a guarded move', () => {
    const p = ok('move straight\nif visited > 0 then move l1')
    expect(p.statements[0]).toEqual({ kind: 'rule', action: { kind: 'move', target: [{ refs: [{ kind: 'straight' }] }] } })
    const r = p.statements[1]
    expect(r.kind).toBe('rule')
    if (r.kind === 'rule') {
      expect(r.guard?.pred.kind).toBe('inline')
      expect(r.action).toEqual({ kind: 'move', target: [{ refs: [{ kind: 'turn', dir: 'l', n: 1 }] }] })
    }
  })

  it('parses split sets and .-chains', () => {
    const p = ok('move [r1, l1]\nmove straight.r2.e3')
    expect(p.statements[0]).toEqual({
      kind: 'rule',
      action: { kind: 'move', target: [{ refs: [{ kind: 'turn', dir: 'r', n: 1 }] }, { refs: [{ kind: 'turn', dir: 'l', n: 1 }] }] },
    })
    expect(p.statements[1]).toEqual({
      kind: 'rule',
      action: {
        kind: 'move',
        target: [{ refs: [{ kind: 'straight' }, { kind: 'turn', dir: 'r', n: 2 }, { kind: 'edge', index: 3 }] }],
      },
    })
  })

  it('rejects the old -> chain separator (use .)', () => {
    expect(parseProgram('move straight -> r2').ok).toBe(false)
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

  it('parses an attribute .-path inside a guard (delegated to the predicate DSL)', () => {
    const p = ok('if visited.r1 > 0 then move l1')
    const r = p.statements[0]
    if (r.kind !== 'rule' || r.guard?.pred.kind !== 'inline') throw new Error('expected an inline rule guard')
    const pred = r.guard.pred.pred
    if (pred.kind !== 'compare' || pred.left.kind !== 'attr') throw new Error('expected a "visited.r1" comparison')
    expect(pred.left.name).toBe('visited')
    expect(pred.left.path).toEqual([{ kind: 'turn', dir: 'r', n: 1 }])
  })

  it('parses eN move edges', () => {
    const p = ok('move e0\nmove [e1, e2]')
    expect(p.statements[0]).toEqual({ kind: 'rule', action: { kind: 'move', target: [{ refs: [{ kind: 'edge', index: 0 }] }] } })
    expect(p.statements[1]).toEqual({
      kind: 'rule',
      action: { kind: 'move', target: [{ refs: [{ kind: 'edge', index: 1 }] }, { refs: [{ kind: 'edge', index: 2 }] }] },
    })
  })

  it('parses registry writes for tile (bracketed) and walker registries', () => {
    const p = ok('put [A] = visited + 1\nincrease P\nincrease Q by 2')
    expect(p.statements[0]).toMatchObject({ kind: 'rule', action: { kind: 'put', target: [{ kind: 'tile-reg', reg: 'a' }] } })
    expect(p.statements[1]).toMatchObject({
      action: { kind: 'increase', target: [{ kind: 'walker-reg', reg: 'P' }], by: { expr: { kind: 'number', value: 1 } } },
    })
    expect(p.statements[2]).toMatchObject({ action: { kind: 'increase', target: [{ kind: 'walker-reg', reg: 'Q' }] } })
  })

  it('parses a .-path on a tile-registry write (put/increase a neighbour)', () => {
    const p = ok('put [B.e1] = 1\nincrease [C.r1.e5] by 2')
    expect(p.statements[0]).toMatchObject({
      action: { kind: 'put', target: [{ kind: 'tile-reg', reg: 'b', path: [{ kind: 'edge', index: 1 }] }] },
    })
    expect(p.statements[1]).toMatchObject({
      action: {
        kind: 'increase',
        target: [{ kind: 'tile-reg', reg: 'c', path: [{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'edge', index: 5 }] }],
      },
    })
  })

  it('writes several tile registries at once: put [A, B]', () => {
    expect(ok('put [A, B] = 1').statements[0]).toMatchObject({
      action: { kind: 'put', target: [{ kind: 'tile-reg', reg: 'a' }, { kind: 'tile-reg', reg: 'b' }] },
    })
  })

  it('parses a bare tile-registry write (put A / increase A / put A.e1)', () => {
    const p = ok('put A = visited + 1\nincrease A\nput A.e1 = 1')
    expect(p.statements[0]).toMatchObject({ kind: 'rule', action: { kind: 'put', target: [{ kind: 'tile-reg', reg: 'a' }] } })
    expect(p.statements[1]).toMatchObject({ action: { kind: 'increase', target: [{ kind: 'tile-reg', reg: 'a' }] } })
    expect(p.statements[2]).toMatchObject({
      action: { kind: 'put', target: [{ kind: 'tile-reg', reg: 'a', path: [{ kind: 'edge', index: 1 }] }] },
    })
  })

  it('expands an edge/turn range in a move target', () => {
    expect(ok('move [r1..r4]').statements[0]).toEqual({
      kind: 'rule',
      action: {
        kind: 'move',
        target: [
          { refs: [{ kind: 'turn', dir: 'r', n: 1 }] },
          { refs: [{ kind: 'turn', dir: 'r', n: 2 }] },
          { refs: [{ kind: 'turn', dir: 'r', n: 3 }] },
          { refs: [{ kind: 'turn', dir: 'r', n: 4 }] },
        ],
      },
    })
    expect(ok('move [e1..3, e6..e8]').statements[0]).toEqual({
      kind: 'rule',
      action: { kind: 'move', target: [1, 2, 3, 6, 7, 8].map((index) => ({ refs: [{ kind: 'edge', index }] })) },
    })
  })

  it('distinguishes a . chain hop from a .. range (both share the . character)', () => {
    // `e0.e4` is ONE target hopping two edges; `[e0..e2]` is a range expanding to THREE targets. The
    // lexer matches the two-char `..` before a lone `.`, so a hop and a range never collide.
    expect(ok('move e0.e4').statements[0]).toEqual({
      kind: 'rule',
      action: { kind: 'move', target: [{ refs: [{ kind: 'edge', index: 0 }, { kind: 'edge', index: 4 }] }] },
    })
    expect(ok('move [e0..e2]').statements[0]).toEqual({
      kind: 'rule',
      action: { kind: 'move', target: [0, 1, 2].map((index) => ({ refs: [{ kind: 'edge', index }] })) },
    })
  })

  it('rejects a reducer on a move target (modifiers are for conditions / put values)', () => {
    expect(parseProgram('move [e1, e2]:all').ok).toBe(false)
  })

  it('parses morph, update, directives and reset', () => {
    const p = ok(
      'morph spinner straight\nupdate max-split 4\ndirective if visited > 0 always forbid move\nreset directives',
    )
    expect(p.statements[0]).toEqual({ kind: 'rule', action: { kind: 'morph', def: 'spinner', target: [{ refs: [{ kind: 'straight' }] }] } })
    expect(p.statements[1]).toEqual({ kind: 'rule', action: { kind: 'update', setting: 'max-split', value: 4 } })
    expect(p.statements[2]).toMatchObject({ kind: 'directive', allow: false })
    expect(p.statements[3]).toEqual({ kind: 'reset' })
  })

  it('parses a directive with a .target attribute path (gate the destination)', () => {
    const p = ok('directive if visited.target > 0 always forbid move')
    const d = p.statements[0]
    expect(d.kind).toBe('directive')
    if (d.kind === 'directive') {
      expect(d.allow).toBe(false)
      expect(d.guard.pred.kind).toBe('inline')
      if (d.guard.pred.kind === 'inline') expect(predReadsTarget(d.guard.pred.pred)).toBe(true)
    }
  })

  it('parses a .target guard on a move rule', () => {
    const p = ok('if visited.target > 0 then move [r1, l1]')
    const r = p.statements[0]
    if (r.kind !== 'rule') throw new Error('expected rule')
    if (r.guard?.pred.kind === 'inline') expect(predReadsTarget(r.guard.pred.pred)).toBe(true)
    expect(r.action).toEqual({
      kind: 'move',
      target: [{ refs: [{ kind: 'turn', dir: 'r', n: 1 }] }, { refs: [{ kind: 'turn', dir: 'l', n: 1 }] }],
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

  it('parses a bare tile registry read in a guard (A == 5)', () => {
    const p = ok('if A == 5 then move straight')
    const r = p.statements[0]
    if (r.kind !== 'rule' || r.guard?.pred.kind !== 'inline') throw new Error('expected an inline rule guard')
    const pred = r.guard.pred.pred
    expect(pred).toMatchObject({ kind: 'compare', op: '==', left: { kind: 'regterm', reg: 'a' }, right: { kind: 'number', value: 5 } })
  })

  it('parses an if-block with several statements', () => {
    const p = ok('if visited-neighbors == 1 {\n  put A = 1\n  move nearest-unvisited\n}')
    expect(p.statements).toHaveLength(1)
    const b = p.statements[0]
    if (b.kind !== 'if-block') throw new Error('expected an if-block')
    expect(b.body.map((s) => s.kind)).toEqual(['rule', 'rule'])
    expect(b.body[1]).toMatchObject({ kind: 'rule', action: { kind: 'move', target: [{ refs: [{ kind: 'unvisited' }] }] } })
  })

  it('nests if-blocks', () => {
    const p = ok('if visited > 0 {\n  if A > 0 {\n    move straight\n  }\n}')
    const outer = p.statements[0]
    if (outer.kind !== 'if-block') throw new Error('expected an outer if-block')
    expect(outer.body[0].kind).toBe('if-block')
  })

  it('rejects a header setting inside a block', () => {
    const r = parseProgram('if visited > 0 {\n  max-split = 3\n}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toContain('header setting')
  })

  it('parses a standalone find-tile and a later move f0', () => {
    const p = ok('find-tile A == 5 {\n  move nearest-unvisited\n}\nif visited == 2 then move f0')
    const f = p.statements[0]
    if (f.kind !== 'find-tile') throw new Error('expected a find-tile statement')
    expect(f.find.index).toBe(0)
    expect(f.find.body).toHaveLength(1)
    const mv = p.statements[1]
    if (mv.kind !== 'rule' || mv.action.kind !== 'move') throw new Error('expected a guarded move')
    expect(mv.action.target).toEqual([{ base: { kind: 'found', index: 0 }, refs: [] }])
  })

  it('parses an inline find-tile as a move base', () => {
    const p = ok('if visited == 2 then move find-tile A == 5 {\n  move straight\n}')
    const r = p.statements[0]
    if (r.kind !== 'rule' || r.action.kind !== 'move') throw new Error('expected a move rule')
    const base = r.action.target[0].base
    if (base?.kind !== 'find') throw new Error('expected an inline find base')
    expect(base.find.index).toBe(0)
  })

  it('parses a found base with a trailing chain and a split of them', () => {
    const p = ok('find-tile A == 5 { move straight }\nmove [f0.e0, f0.straight]')
    const mv = p.statements[1]
    if (mv.kind !== 'rule' || mv.action.kind !== 'move') throw new Error('expected a move')
    expect(mv.action.target).toEqual([
      { base: { kind: 'found', index: 0 }, refs: [{ kind: 'edge', index: 0 }] },
      { base: { kind: 'found', index: 0 }, refs: [{ kind: 'straight' }] },
    ])
  })

  it('numbers find-tile occurrences by source position (f0, f1)', () => {
    const p = ok('find-tile A == 1 { move straight }\nfind-tile A == 2 { move r1 }\nmove [f0, f1]')
    expect((p.statements[0] as { kind: 'find-tile'; find: { index: number } }).find.index).toBe(0)
    expect((p.statements[1] as { kind: 'find-tile'; find: { index: number } }).find.index).toBe(1)
  })

  it('reads a found tile in a guard (tile-type.f0)', () => {
    const p = ok('find-tile A == 5 { move straight }\nif tile-type.f0 == wedge then move f0')
    const r = p.statements[1]
    if (r.kind !== 'rule' || r.guard?.pred.kind !== 'inline') throw new Error('expected an inline guard')
    expect(r.guard.pred.pred).toMatchObject({ kind: 'shape', shape: 'wedge', path: [{ kind: 'found', index: 0 }] })
  })

  it('rejects fN with no matching find-tile', () => {
    const r = parseProgram('move f0')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toContain('f0')
  })

  it('rejects fN out of range (f2 with two find-tiles)', () => {
    const r = parseProgram('find-tile A == 1 { move straight }\nfind-tile A == 2 { move r1 }\nmove f2')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toContain('f2')
  })

  it('rejects a dangling fN referenced only inside an else branch', () => {
    // The fN validation must descend into else branches too — not just the if-body — or a bad ref there
    // slips through parse and silently becomes a no-op at runtime.
    const r = parseProgram('if visited > 0 {\n  move straight\n} else {\n  move f0\n}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toContain('f0')
  })

  it('rejects fN as a non-first hop (e0.f1)', () => {
    expect(parseProgram('find-tile A == 5 { move straight }\nmove e0.f0').ok).toBe(false)
  })

  it('parses the owner directive that chains edge hops after .target', () => {
    // `.target.e2.e1` is a base (.target) leading two absolute edge hops — previously rejected as terminal.
    expect(parseProgram('directive if visited.e2.e2 == 1 or visited.target.e2.e1 == 1 always forbid move\nmove [e0, e1, e2, e3]').ok).toBe(true)
  })

  it('parses a bare write target that chains after .tile N (exercises the number-dot lexer fix)', () => {
    // `put B.tile 5.e1` — the bare write-target scanner walks the `.`-run on TRAVERSER tokens, so `5.e1`
    // must split into `5` + `.e1` rather than lexing `5.` as a decimal that swallows the separator.
    expect(parseProgram('put B.tile 5.e1 = 1').ok).toBe(true)
  })

  it('rejects a base (.target / .tile N) sitting after another hop in a guard', () => {
    expect(parseProgram('if visited.e2.target == 1 then move straight').ok).toBe(false)
    expect(parseProgram('if visited.e0.tile 5 == 1 then move straight').ok).toBe(false)
  })

  it('rejects a non-move statement inside a find-tile body', () => {
    const r = parseProgram('find-tile A == 5 {\n  put A = 1\n}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/move commands/)
  })

  it('rejects a base (fN / find-tile) inside a find-tile body move', () => {
    const r = parseProgram('find-tile A == 5 {\n  move f0\n}')
    expect(r.ok).toBe(false)
  })

  it('parses an if/else block', () => {
    const p = ok('if visited > 0 {\n  move straight\n} else {\n  move r1\n}')
    const b = p.statements[0]
    if (b.kind !== 'if-block') throw new Error('expected an if-block')
    expect(b.body.map((s) => s.kind)).toEqual(['rule'])
    expect(b.elseBody?.map((s) => s.kind)).toEqual(['rule'])
  })

  it('parses else on its own line (Allman braces)', () => {
    const p = ok('if visited > 0 {\n  move straight\n}\nelse {\n  move r1\n}')
    expect(p.statements).toHaveLength(1)
    const b = p.statements[0]
    if (b.kind !== 'if-block') throw new Error('expected an if-block')
    expect(b.elseBody).toHaveLength(1)
  })

  it('parses else-if as a nested if-block in the else branch', () => {
    const p = ok('if A == 1 {\n  move straight\n} else if A == 2 {\n  move r1\n} else {\n  move l1\n}')
    const outer = p.statements[0]
    if (outer.kind !== 'if-block' || !outer.elseBody) throw new Error('expected an if-block with an else')
    expect(outer.elseBody).toHaveLength(1)
    const mid = outer.elseBody[0]
    if (mid.kind !== 'if-block') throw new Error('expected a nested else-if block')
    expect(mid.elseBody?.map((s) => s.kind)).toEqual(['rule']) // the final plain else
  })

  it('parses max-split inside a find-tile block (default 1)', () => {
    const withCap = ok('find-tile A == 5 {\n  max-split = 3\n  move [e0, e1, e2]\n}\nmove f0')
    const f = withCap.statements[0]
    if (f.kind !== 'find-tile') throw new Error('expected a find-tile')
    expect(f.find.maxSplit).toBe(3)
    expect(f.find.body).toHaveLength(1) // the max-split line is a setting, not a move
    const dflt = ok('find-tile A == 5 { move straight }\nmove f0')
    expect((dflt.statements[0] as { kind: 'find-tile'; find: { maxSplit: number } }).find.maxSplit).toBe(1)
  })
})
