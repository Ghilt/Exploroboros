import { describe, it, expect } from 'vitest'
import { squareTiling } from '../tiling'
import { addVisit, type TileState } from '../canvas'
import { parsePredicate } from '../dsl'
import { colorize, compileRules } from './colorize'
import type { ColoringRule, RampAttr, RuleColor } from './types'

type Overlay = ReadonlyMap<string, TileState>
const NO_TEXT = new Map<string, string>()
const NO_INDEX = new Map<string, number>()
const sq = squareTiling(3, 3)

const flat = (hex: string): RuleColor => ({ kind: 'flat', hex })
const inline = (text: string, color: RuleColor, opacity = 1, id = text): ColoringRule => ({
  id,
  predicate: { kind: 'inline', text },
  color,
  opacity,
})

function run(
  rules: ColoringRule[],
  overlay: Overlay = new Map(),
  text = NO_TEXT,
  names = NO_TEXT,
): Map<string, string> {
  return colorize(rules, text, names, sq, overlay, NO_INDEX)
}

describe('colorize — rule stacking', () => {
  it('last matching opaque rule wins', () => {
    const overlay = addVisit(new Map(), 'sq:0,0')
    const out = run([inline('visited > 0', flat('#ff0000')), inline('visited > 0', flat('#0000ff'))], overlay)
    expect(out.get('sq:0,0')).toBe('rgba(0, 0, 255, 1)')
  })

  it('a translucent later rule blends over the earlier one', () => {
    const overlay = addVisit(new Map(), 'sq:0,0')
    const out = run([inline('visited > 0', flat('#ff0000')), inline('visited > 0', flat('#0000ff'), 0.5)], overlay)
    // red under blue@50% -> purple
    expect(out.get('sq:0,0')).toBe('rgba(128, 0, 128, 1)')
  })

  it('leaves unmatched tiles out of the map', () => {
    const out = run([inline('visited > 5', flat('#ff0000'))])
    expect(out.size).toBe(0)
  })
})

describe('colorize — ramps', () => {
  const ramp = (
    stops: Array<{ hex: string; at: number | null }>,
    mod: number | null,
    attr: RampAttr = 'visited',
    attrIndex?: number,
  ): RuleColor => ({ kind: 'ramp', ramp: { attr, mod, stops, attrIndex } })

  it('fades across an attribute with modulo and even (blank) breakpoints', () => {
    let overlay: Overlay = new Map()
    overlay = addVisit(overlay, 'sq:0,0') // visited 1
    overlay = addVisit(addVisit(overlay, 'sq:0,1'), 'sq:0,1') // visited 2
    const color = ramp([{ hex: '#000000', at: null }, { hex: '#ffffff', at: null }], 2)
    const out = run([inline('visited >= 0', color)], overlay)
    expect(out.get('sq:1,1')).toBe('rgba(0, 0, 0, 1)') // visited 0 -> stop 0
    expect(out.get('sq:0,0')).toBe('rgba(128, 128, 128, 1)') // visited 1 -> halfway
    expect(out.get('sq:0,1')).toBe('rgba(0, 0, 0, 1)') // visited 2 -> wraps to stop 0
  })

  it('honours explicit breakpoints', () => {
    let overlay: Overlay = new Map()
    for (let i = 0; i < 5; i += 1) overlay = addVisit(overlay, 'sq:0,0') // visited 5
    const color = ramp([{ hex: '#000000', at: 0 }, { hex: '#ffffff', at: 10 }], null)
    const out = run([inline('visited >= 0', color)], overlay)
    expect(out.get('sq:0,0')).toBe('rgba(128, 128, 128, 1)') // 5 of 0..10 -> halfway
    expect(out.get('sq:1,1')).toBe('rgba(0, 0, 0, 1)') // visited 0 -> first colour
  })

  it('uses a single ramp stop as a flat colour', () => {
    const color = ramp([{ hex: '#123456', at: null }], null)
    const out = run([inline('visited >= 0', color)])
    expect(out.get('sq:0,0')).toBe('rgba(18, 52, 86, 1)')
  })

  it('fades over a step attribute (an unvisited tile reads as 0)', () => {
    const overlay = addVisit(new Map(), 'sq:0,0', 5) // latest-step = 5
    const color = ramp([{ hex: '#000000', at: null }, { hex: '#ffffff', at: null }], 10, 'latest-step')
    const out = run([inline('visited >= 0', color)], overlay)
    expect(out.get('sq:0,0')).toBe('rgba(128, 128, 128, 1)') // 5 of 0..10 -> halfway
    expect(out.get('sq:1,1')).toBe('rgba(0, 0, 0, 1)') // unvisited -> step 0 -> first colour
  })

  it('fades over an indexed attribute using attrIndex', () => {
    // coordinate[1] of sq:1,2 is the column = 2; over 0..4 that's halfway
    const color = ramp([{ hex: '#000000', at: null }, { hex: '#ffffff', at: null }], 4, 'coordinate', 1)
    const out = run([inline('visited >= 0', color)])
    expect(out.get('sq:1,2')).toBe('rgba(128, 128, 128, 1)')
  })
})

describe('colorize — absolute @-paths read a neighbouring tile (walker-free)', () => {
  const reg = (a: number): TileState => ({ visits: [], a, b: 0, c: 0 })

  it('[A@e1] > 0 colours the tile whose edge-1 (east) neighbour has registry A set', () => {
    // On the 3x3 grid, sq:1,2 is east (edge 1) of sq:1,1. Give it A = 1.
    const overlay: Overlay = new Map([['sq:1,2', reg(1)]])
    const out = run([inline('[A@e1] > 0', flat('#00ff00'))], overlay)
    expect(out.get('sq:1,1')).toBe('rgba(0, 255, 0, 1)') // east neighbour has A > 0
    expect(out.has('sq:1,2')).toBe(false) // its own east neighbour is off-grid -> A defaults to 0
  })

  it('reads a numeric attribute across an edge too (visited@e1)', () => {
    const overlay = addVisit(new Map(), 'sq:1,2') // east neighbour visited
    expect(run([inline('visited@e1 > 0', flat('#0000ff'))], overlay).get('sq:1,1')).toBe('rgba(0, 0, 255, 1)')
  })

  it('relative @-paths still fall back (no walker) — the predicate parses but colours nothing', () => {
    const overlay = addVisit(new Map(), 'sq:1,2')
    expect(parsePredicate('visited@straight > 0').ok).toBe(true) // valid syntax...
    expect(run([inline('visited@straight > 0', flat('#00ff00'))], overlay).size).toBe(0) // ...but unresolvable here
  })
})

describe('colorize — predicate resolution', () => {
  it('resolves a referenced predicate by id', () => {
    const overlay = addVisit(new Map(), 'sq:0,0')
    const rule: ColoringRule = { id: 'r', predicate: { kind: 'ref', id: 'p1' }, color: flat('#00ff00'), opacity: 1 }
    const out = colorize([rule], new Map([['p1', 'visited > 0']]), NO_TEXT, sq, overlay, NO_INDEX)
    expect(out.get('sq:0,0')).toBe('rgba(0, 255, 0, 1)')
  })

  it('drops a rule whose referenced predicate is missing or unparseable', () => {
    const missing: ColoringRule = { id: 'r1', predicate: { kind: 'ref', id: 'gone' }, color: flat('#fff'), opacity: 1 }
    const broken = inline('visited >', flat('#fff'))
    expect(compileRules([missing, broken], NO_TEXT, NO_TEXT)).toHaveLength(0)
    expect(run([missing, broken], addVisit(new Map(), 'sq:0,0')).size).toBe(0)
  })
})
