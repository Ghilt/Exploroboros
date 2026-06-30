import { describe, it, expect } from 'vitest'
import { walkerGroups, statementGroups, candidateGroups } from './highlights'
import type { TraverserTrace, StmtTrace, CandidateTrace } from '../traverse'
import type { HighlightRole } from '../components/TilingCanvas'

const idsFor = (groups: ReturnType<typeof walkerGroups>, role: HighlightRole) =>
  groups.find((g) => g.role === role)?.ids ?? []

function header(over: Partial<TraverserTrace> = {}): TraverserTrace {
  return {
    id: 'tr1',
    def: 'W',
    tile: 'sq:2,2',
    tileType: 'square',
    heading: 0,
    movement: 'relative',
    steps: 0,
    splits: 0,
    p: 0,
    q: 0,
    r: 0,
    statements: [],
    branches: [],
    ...over,
  }
}

describe('debug highlight mapping', () => {
  it('walker summary highlights the current tile + surviving branches', () => {
    const w = header({ branches: [{ tile: 'sq:2,3', heading: 0 }, { tile: 'sq:3,2', heading: 0 }] })
    const g = walkerGroups(w)
    expect(idsFor(g, 'current')).toEqual(['sq:2,2'])
    expect([...idsFor(g, 'chosen')].sort()).toEqual(['sq:2,3', 'sq:3,2'])
  })

  it('a gate-skip highlights the current tile + the tile the decorated guard read', () => {
    const w = header()
    const s: StmtTrace = {
      kind: 'gate-skip',
      source: 'if tile-type == wedge @ edge 0 then move edge 0',
      guard: { text: 'tile-type == wedge @ edge 0', tileId: 'sq:3,2', tileType: 'square', decorated: true, result: false },
    }
    const g = statementGroups(w, s)
    expect(idsFor(g, 'current')).toEqual(['sq:2,2'])
    expect(idsFor(g, 'decorator')).toEqual(['sq:3,2'])
  })

  it('an undecorated gate-skip marks no decorator tile', () => {
    const w = header()
    const s: StmtTrace = {
      kind: 'gate-skip',
      source: 'if visited > 0 then move straight',
      guard: { text: 'visited > 0', tileId: 'sq:2,2', tileType: 'square', decorated: false, result: false },
    }
    expect(statementGroups(w, s).some((grp) => grp.role === 'decorator')).toBe(false)
  })

  it('a move with a rejected candidate yields current + chosen + rejected', () => {
    const candidates: CandidateTrace[] = [
      { chainText: 'straight', dest: 'sq:2,3', destType: 'square', heading: 0, survived: true },
      {
        chainText: 'r1',
        dest: 'sq:1,2',
        destType: 'square',
        heading: 0,
        survived: false,
        reject: { by: 'directive', index: 0, allow: false, guard: { text: 'visited > 0 @ target', tileId: 'sq:1,2', tileType: 'square', decorated: true, result: true } },
      },
    ]
    const s: StmtTrace = { kind: 'move', source: 'move [straight, r1]', candidates }
    const g = statementGroups(header(), s)
    expect(idsFor(g, 'current')).toEqual(['sq:2,2'])
    expect(idsFor(g, 'chosen')).toEqual(['sq:2,3'])
    expect(idsFor(g, 'rejected')).toEqual(['sq:1,2'])
  })

  it('a single candidate row highlights its destination by survival', () => {
    const reject: CandidateTrace = { chainText: 'r1', dest: 'sq:1,2', destType: 'square', heading: 0, survived: false, reject: { by: 'boundary' } }
    expect(idsFor(candidateGroups(header(), reject), 'rejected')).toEqual(['sq:1,2'])
    const ok: CandidateTrace = { chainText: 'straight', dest: 'sq:2,3', destType: 'square', heading: 0, survived: true }
    expect(idsFor(candidateGroups(header(), ok), 'chosen')).toEqual(['sq:2,3'])
  })
})
