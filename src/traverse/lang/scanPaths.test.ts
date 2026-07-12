import { describe, it, expect } from 'vitest'
import { scanPaths, type PathOccurrence } from './scanPaths'

// scanPaths is purely structural (no tiling) — it reports each path's span, line, base, refs, and raw text.
const byText = (occ: readonly PathOccurrence[], text: string) => occ.filter((o) => o.text === text)
const one = (occ: readonly PathOccurrence[], text: string): PathOccurrence => {
  const hits = byText(occ, text)
  expect(hits, `exactly one occurrence with text "${text}"`).toHaveLength(1)
  return hits[0]
}

describe('scanPaths — move chains', () => {
  it('a bare move straight', () => {
    const occ = scanPaths('move straight')
    expect(occ).toHaveLength(1)
    expect(occ[0].base).toEqual({ kind: 'current' })
    expect(occ[0].refs).toEqual([{ kind: 'straight' }])
    expect(occ[0].line).toBe(0)
    expect(occ[0].text).toBe('straight')
    expect('move straight'.slice(occ[0].span.start, occ[0].span.end)).toBe('straight')
  })

  it('a dot-chained move keeps every hop and does NOT double-count the separator', () => {
    const occ = scanPaths('move e0.e4')
    expect(occ).toHaveLength(1)
    expect(occ[0].refs).toEqual([{ kind: 'edge', index: 0 }, { kind: 'edge', index: 4 }])
    expect(occ[0].text).toBe('e0.e4')
  })

  it('turns', () => {
    expect(scanPaths('move r1.r2')[0].refs).toEqual([{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'turn', dir: 'r', n: 2 }])
    expect(scanPaths('move l2')[0].refs).toEqual([{ kind: 'turn', dir: 'l', n: 2 }])
  })

  it('a move list emits one occurrence per element, all on the same line', () => {
    const occ = scanPaths('move [straight, r1, l2, e3, nearest-unvisited]')
    expect(occ).toHaveLength(5)
    expect(occ.every((o) => o.line === 0)).toBe(true)
    expect(one(occ, 'straight').refs).toEqual([{ kind: 'straight' }])
    expect(one(occ, 'r1').refs).toEqual([{ kind: 'turn', dir: 'r', n: 1 }])
    expect(one(occ, 'l2').refs).toEqual([{ kind: 'turn', dir: 'l', n: 2 }])
    expect(one(occ, 'e3').refs).toEqual([{ kind: 'edge', index: 3 }])
    expect(one(occ, 'nearest-unvisited').refs).toEqual([{ kind: 'unvisited' }])
  })

  it('list elements get their OWN spans (partial selection can pick one)', () => {
    const src = 'move [r1.r2, straight.straight]'
    const occ = scanPaths(src)
    expect(occ).toHaveLength(2)
    const a = one(occ, 'r1.r2')
    const b = one(occ, 'straight.straight')
    expect(src.slice(a.span.start, a.span.end)).toBe('r1.r2')
    expect(src.slice(b.span.start, b.span.end)).toBe('straight.straight')
    expect(a.refs).toEqual([{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'turn', dir: 'r', n: 2 }])
    expect(b.refs).toEqual([{ kind: 'straight' }, { kind: 'straight' }])
  })

  it('a range expands to one occurrence per step', () => {
    const occ = scanPaths('move [e1..e3]')
    expect(occ.map((o) => o.refs)).toEqual([
      [{ kind: 'edge', index: 1 }],
      [{ kind: 'edge', index: 2 }],
      [{ kind: 'edge', index: 3 }],
    ])
  })

  it('morph skips the def name and scans its target', () => {
    const occ = scanPaths('morph gasket straight')
    expect(occ).toHaveLength(1)
    expect(occ[0].text).toBe('straight')
    expect(occ[0].refs).toEqual([{ kind: 'straight' }])
  })

  it('a found base is reported (unresolvable downstream)', () => {
    const occ = scanPaths('move f0')
    expect(occ).toHaveLength(1)
    expect(occ[0].base).toEqual({ kind: 'found', index: 0 })
    expect(occ[0].refs).toEqual([])
  })
})

describe('scanPaths — attribute / write .-paths', () => {
  it('a neighbour read inside a guard, plus the move on the same line', () => {
    const occ = scanPaths('if visited.e1 > 0 then move straight')
    const g = one(occ, 'visited.e1')
    expect(g.base).toEqual({ kind: 'current' })
    expect(g.refs).toEqual([{ kind: 'edge', index: 1 }])
    const m = one(occ, 'straight')
    expect(m.refs).toEqual([{ kind: 'straight' }])
    expect(occ).toHaveLength(2)
    expect(g.line).toBe(0)
    expect(m.line).toBe(0)
  })

  it('a bare write target with a path (the owner example)', () => {
    const occ = scanPaths('put a.r1.straight.straight = 1')
    expect(occ).toHaveLength(1)
    expect(occ[0].text).toBe('a.r1.straight.straight')
    expect(occ[0].base).toEqual({ kind: 'current' })
    expect(occ[0].refs).toEqual([{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'straight' }, { kind: 'straight' }])
  })

  it('a bracketed write-target path; the plain registry beside it is not a path', () => {
    const occ = scanPaths('put [A, B.e1] = 1')
    expect(occ).toHaveLength(1)
    expect(occ[0].text).toBe('B.e1')
    expect(occ[0].refs).toEqual([{ kind: 'edge', index: 1 }])
  })

  it('a tile-type shape read', () => {
    const occ = scanPaths('if tile-type.e0 == square then move straight')
    expect(one(occ, 'tile-type.e0').refs).toEqual([{ kind: 'edge', index: 0 }])
  })

  it('.target is a terminal base', () => {
    const occ = scanPaths('if visited.target > 0 then move straight')
    const t = one(occ, 'visited.target')
    expect(t.base).toEqual({ kind: 'target' })
    expect(t.refs).toEqual([])
  })

  it('.fN base then edge hops', () => {
    const occ = scanPaths('if visited.f1.e0 > 0 then move straight')
    const f = one(occ, 'visited.f1.e0')
    expect(f.base).toEqual({ kind: 'found', index: 1 })
    expect(f.refs).toEqual([{ kind: 'edge', index: 0 }])
  })

  it('.tile N terminal base', () => {
    const occ = scanPaths('if visited.tile 3 > 0 then move straight')
    const t = one(occ, 'visited.tile 3')
    expect(t.base).toEqual({ kind: 'tile', index: 3 })
    expect(t.refs).toEqual([])
  })

  it('a multi-hop attribute path re-aims across hops', () => {
    const occ = scanPaths('if visited.r1.straight > 0 then move straight')
    expect(one(occ, 'visited.r1.straight').refs).toEqual([{ kind: 'turn', dir: 'r', n: 1 }, { kind: 'straight' }])
  })
})

describe('scanPaths — nothing spurious', () => {
  it('a program with no paths yields nothing', () => {
    expect(scanPaths('max-split = 4\nput [A] = [A] + 1\nupdate heading 2')).toHaveLength(0)
  })

  it('the trailing "move" keyword of a directive is not a path', () => {
    expect(scanPaths('directive if visited.target > 0 always forbid move')).toEqual([
      expect.objectContaining({ text: 'visited.target' }),
    ])
  })

  it('line indices track across a multi-line program', () => {
    const occ = scanPaths('move straight\nput [A] = 1\nmove e2')
    expect(one(occ, 'straight').line).toBe(0)
    expect(one(occ, 'e2').line).toBe(2)
  })

  it('CRLF newlines still count as one line each', () => {
    const occ = scanPaths('move straight\r\nmove e2')
    expect(one(occ, 'e2').line).toBe(1)
  })
})

describe('scanPaths — robustness', () => {
  it('an unlexable program returns nothing (never throws)', () => {
    expect(scanPaths('move $')).toEqual([])
  })

  it('a half-typed chain is skipped', () => {
    expect(scanPaths('move r')).toEqual([])
  })

  it('a dangling . is skipped', () => {
    expect(scanPaths('if visited. > 0 then move straight')).toEqual([expect.objectContaining({ text: 'straight' })])
  })
})
