import { describe, expect, it } from 'vitest'
import { INITIAL_STATE_PRESETS, appendPreset } from './initialStatePresets'
import { compileDoc, resolveInitialState } from '../initstate'
import type { Doc } from '../initstate'
import { buildTiling } from '../canvas'
import { nodeById } from '../tiling'
import { compileProgram, type Program } from '../traverse'

const EMPTY = new Map<string, never>()

function doc(src: string): Doc {
  const r = compileDoc(src, new Map())
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

function presetDoc(name: string): Doc {
  const p = INITIAL_STATE_PRESETS.find((x) => x.name === name)
  if (!p) throw new Error(`no preset ${name}`)
  return doc(p.text)
}

// t1 = a plain walker, so the presets (which all seed t1) resolve to real seeds.
const walkerDefs = new Map<string, Program>([['walker', (() => {
  const c = compileProgram('move nearest-unvisited', new Map())
  if (!c.ok) throw new Error(c.error.message)
  return c.value
})()]])

describe('initial-state presets', () => {
  it('every preset parses as a valid Initial-state document', () => {
    for (const p of INITIAL_STATE_PRESETS) {
      const r = compileDoc(p.text, new Map())
      expect(r.ok, `${p.name}: ${r.ok ? '' : r.error.message}`).toBe(true)
    }
  })

  it('offers the named presets', () => {
    expect(INITIAL_STATE_PRESETS.map((p) => p.name)).toEqual([
      'Edges',
      'Cross',
      'Diagonal cross',
      'Corners',
      'Midpoints',
    ])
  })

  // The square-grid heading convention the presets are authored against: 0 = up/N, 1 = right/E,
  // 2 = down/S, 3 = left/W. "Inward" = toward the board centre.
  it('Corners: one t1 blip in each corner, aimed inward (top→down, bottom→up)', () => {
    const t = buildTiling('square', 10)
    const res = resolveInitialState(presetDoc('Corners'), t, ['walker'], walkerDefs, EMPTY, EMPTY)
    expect(res.seeds).toHaveLength(4)
    expect(new Set(res.seeds.map((s) => s.tile)).size).toBe(4) // four distinct tiles
    const b = t.bounds
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    // one seed in each corner quadrant
    const quads = res.seeds.map((s) => {
      const n = nodeById(t, s.tile)!
      return `${n.centroid.x < cx ? 'L' : 'R'}${n.centroid.y > cy ? 'T' : 'B'}`
    })
    expect(new Set(quads)).toEqual(new Set(['LT', 'RT', 'LB', 'RB']))
    // top corners point down (2), bottom corners point up (0) — inward vertically
    for (const s of res.seeds) {
      const n = nodeById(t, s.tile)!
      expect(s.heading).toBe(n.centroid.y > cy ? 2 : 0)
    }
  })

  it('Midpoints: one t1 blip at each edge midpoint, each aimed inward', () => {
    const t = buildTiling('square', 10)
    const res = resolveInitialState(presetDoc('Midpoints'), t, ['walker'], walkerDefs, EMPTY, EMPTY)
    expect(res.seeds).toHaveLength(4)
    expect(new Set(res.seeds.map((s) => s.tile)).size).toBe(4)
    expect(new Set(res.seeds.map((s) => s.heading))).toEqual(new Set([0, 1, 2, 3])) // one per cardinal
    const b = t.bounds
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    // each walker aims from its edge toward the centre
    for (const s of res.seeds) {
      const n = nodeById(t, s.tile)!
      const dx = n.centroid.x - cx
      const dy = n.centroid.y - cy
      const expected = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : dy > 0 ? 2 : 0
      expect(s.heading).toBe(expected)
    }
  })
})

describe('appendPreset', () => {
  it('sets the text when the document is empty', () => {
    expect(appendPreset('', 'A\nB')).toBe('A\nB')
    expect(appendPreset('   ', 'A')).toBe('A') // whitespace-only counts as empty
  })

  it('appends after a single newline when there is existing text', () => {
    expect(appendPreset('X', 'A\nB')).toBe('X\nA\nB')
    expect(appendPreset('X\n', 'A')).toBe('X\nA') // collapses trailing newlines to one
    expect(appendPreset('X\n\n', 'A')).toBe('X\nA')
  })
})
