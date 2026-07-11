import { describe, it, expect } from 'vitest'
import { walkerGroups, statementGroups, candidateGroups, writeTargetGroups } from './highlights'
import type { TraverserTrace, StmtTrace, CandidateTrace, WriteTargetTrace } from '../traverse'
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

  it('a gate-skip highlights the current tile + the tiles the guard read via .-paths', () => {
    const w = header()
    const s: StmtTrace = {
      kind: 'gate-skip',
      source: 'if tile-type.e0 == wedge then move e0',
      guard: { text: 'tile-type.e0 == wedge', readTiles: [{ id: 'sq:3,2', role: 'read', tileType: 'square', text: '.e0' }], result: false },
    }
    const g = statementGroups(w, s)
    expect(idsFor(g, 'current')).toEqual(['sq:2,2'])
    expect(idsFor(g, 'decorator')).toEqual(['sq:3,2'])
  })

  it('a path-less gate-skip marks no decorator tile', () => {
    const w = header()
    const s: StmtTrace = {
      kind: 'gate-skip',
      source: 'if visited > 0 then move straight',
      guard: { text: 'visited > 0', readTiles: [], result: false },
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
        reject: { by: 'directive', index: 0, allow: false, guard: { text: 'visited.target > 0', readTiles: [{ id: 'sq:1,2', role: 'target', tileType: 'square', text: '.target' }], result: true } },
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

  it('a write statement highlights the current tile + every tile it wrote to (off-grid skipped)', () => {
    const s: StmtTrace = {
      kind: 'write',
      source: 'put [A, B.e0, C.e9] = 1',
      targets: [
        { text: 'A', id: 'sq:2,2', tileType: 'square', scope: 'tile' },
        { text: 'B.e0', id: 'sq:3,2', tileType: 'square', scope: 'tile' },
        { text: 'C.e9', id: null, tileType: null, scope: 'tile' }, // off-grid -> not lit
      ],
    }
    const g = statementGroups(header(), s)
    expect(idsFor(g, 'current')).toEqual(['sq:2,2'])
    expect([...idsFor(g, 'write')].sort()).toEqual(['sq:2,2', 'sq:3,2'])
  })

  it('a single write-target row pinpoints just that tile; an off-grid / walker target lights none', () => {
    const w = header()
    const hit: WriteTargetTrace = { text: 'B.e0', id: 'sq:3,2', tileType: 'square', scope: 'tile' }
    expect(idsFor(writeTargetGroups(w, hit), 'chosen')).toEqual(['sq:3,2'])
    const off: WriteTargetTrace = { text: 'C.e9', id: null, tileType: null, scope: 'tile' }
    expect(writeTargetGroups(w, off).some((grp) => grp.role === 'chosen')).toBe(false)
    const walkerReg: WriteTargetTrace = { text: 'P', id: null, tileType: null, scope: 'walker' }
    expect(writeTargetGroups(w, walkerReg).some((grp) => grp.role === 'chosen')).toBe(false)
  })

  it('a candidate rejected by a .-edge guard marks the read tile (≠ destination) as decorator', () => {
    const c: CandidateTrace = {
      chainText: 'straight',
      dest: 'sq:2,3',
      destType: 'square',
      heading: 0,
      survived: false,
      reject: { by: 'own-guard', guard: { text: 'visited.r1 > 0', readTiles: [{ id: 'sq:2,4', role: 'read', tileType: 'square', text: '.r1' }], result: true } },
    }
    const g = candidateGroups(header(), c)
    expect(idsFor(g, 'decorator')).toEqual(['sq:2,4'])
    expect(idsFor(g, 'rejected')).toEqual(['sq:2,3'])
  })
})
