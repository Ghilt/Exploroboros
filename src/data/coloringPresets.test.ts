import { describe, it, expect } from 'vitest'
import { squareTiling } from '../tiling'
import { addVisit, type TileState } from '../canvas'
import { colorize } from '../colorizer'
import {
  COLORING_PRESETS,
  buildPresetRules,
  pickRandomPreset,
  presetPrimaryStops,
  randomColoringRules,
  type ColoringPreset,
} from './coloringPresets'

const HEX = /^#[0-9a-f]{6}$/i
let counter = 0
const makeId = () => `id-${counter++}`

describe('COLORING_PRESETS — the 100 hand-picked palettes', () => {
  it('has exactly 100 uniquely-named presets', () => {
    expect(COLORING_PRESETS).toHaveLength(100)
    expect(new Set(COLORING_PRESETS.map((p) => p.name)).size).toBe(100)
  })

  it('every preset is on the required form', () => {
    for (const p of COLORING_PRESETS) {
      // 3–4 valid hex colours
      expect(p.colors.length, p.name).toBeGreaterThanOrEqual(3)
      expect(p.colors.length, p.name).toBeLessThanOrEqual(4)
      for (const c of p.colors) expect(c, `${p.name}: ${c}`).toMatch(HEX)
      // fade over first/last step
      expect(['first-step', 'latest-step'], p.name).toContain(p.attr)
      // modulo 10..300, integer
      expect(Number.isInteger(p.mod), p.name).toBe(true)
      expect(p.mod, p.name).toBeGreaterThanOrEqual(10)
      expect(p.mod, p.name).toBeLessThanOrEqual(300)
      // known fade style; posterised bands need ≤3 colours (5-stop cap)
      expect(['smooth', 'sharp', 'bands'], p.name).toContain(p.fade)
      if (p.fade === 'bands') expect(p.colors.length, `${p.name} bands`).toBeLessThanOrEqual(3)
      // optional overlay
      if (p.overlay) {
        expect(p.overlay.colors.length, p.name).toBeGreaterThanOrEqual(2)
        expect(p.overlay.colors.length, p.name).toBeLessThanOrEqual(3)
        for (const c of p.overlay.colors) expect(c, `${p.name} overlay: ${c}`).toMatch(HEX)
        expect(p.overlay.opacity, p.name).toBeGreaterThan(0)
        expect(p.overlay.opacity, p.name).toBeLessThan(1)
      }
    }
  })

  it('has a healthy mix of styles, attributes, and overlays', () => {
    const byFade = (f: string) => COLORING_PRESETS.filter((p) => p.fade === f).length
    expect(byFade('smooth')).toBeGreaterThan(0)
    expect(byFade('sharp')).toBeGreaterThan(0)
    expect(byFade('bands')).toBeGreaterThan(0)
    expect(COLORING_PRESETS.filter((p) => p.attr === 'first-step').length).toBeGreaterThan(0)
    expect(COLORING_PRESETS.filter((p) => p.attr === 'latest-step').length).toBeGreaterThan(0)
    expect(COLORING_PRESETS.filter((p) => p.overlay).length).toBeGreaterThan(0)
  })
})

describe('presetPrimaryStops — fade styles', () => {
  const p = (over: Partial<ColoringPreset>): ColoringPreset => ({
    name: 't',
    colors: ['#111111', '#222222', '#333333'],
    attr: 'first-step',
    mod: 30,
    fade: 'smooth',
    ...over,
  })

  it('smooth loops by repeating the first colour, within the 5-stop cap', () => {
    const three = presetPrimaryStops(p({ colors: ['#111111', '#222222', '#333333'], fade: 'smooth' }))
    expect(three.map((s) => s.hex)).toEqual(['#111111', '#222222', '#333333', '#111111'])
    expect(three.every((s) => s.at === null)).toBe(true)

    const four = presetPrimaryStops(p({ colors: ['#111111', '#222222', '#333333', '#444444'], fade: 'smooth' }))
    expect(four).toHaveLength(5)
    expect(four[4].hex).toBe('#111111')
  })

  it('sharp is an even fade with a hard wrap (no repeated first colour)', () => {
    const stops = presetPrimaryStops(p({ colors: ['#111111', '#222222', '#333333'], fade: 'sharp' }))
    expect(stops.map((s) => s.hex)).toEqual(['#111111', '#222222', '#333333'])
    expect(stops.every((s) => s.at === null)).toBe(true)
  })

  it('bands are posterised: solid blocks with coincident boundary stops', () => {
    const stops = presetPrimaryStops(p({ colors: ['#111111', '#222222', '#333333'], mod: 30, fade: 'bands' }))
    // 3 colours -> 5 stops: A@0, A@10, B@10, B@20, C@20
    expect(stops).toEqual([
      { hex: '#111111', at: 0 },
      { hex: '#111111', at: 10 },
      { hex: '#222222', at: 10 },
      { hex: '#222222', at: 20 },
      { hex: '#333333', at: 20 },
    ])
  })

  it('never exceeds the 5-stop cap for any real preset', () => {
    for (const preset of COLORING_PRESETS) {
      expect(presetPrimaryStops(preset).length, preset.name).toBeLessThanOrEqual(5)
    }
  })
})

describe('buildPresetRules — the fixed form', () => {
  it('builds a single full-opacity "if visited" ramp rule with no overlay', () => {
    const preset: ColoringPreset = { name: 't', colors: ['#111111', '#222222', '#333333'], attr: 'latest-step', mod: 40, fade: 'smooth' }
    const rules = buildPresetRules(preset, makeId)
    expect(rules).toHaveLength(1)
    const [r] = rules
    expect(r.predicate).toEqual({ kind: 'ref', id: 'visited' })
    expect(r.opacity).toBe(1)
    expect(r.color.kind).toBe('ramp')
    if (r.color.kind === 'ramp') {
      expect(r.color.ramp.attr).toBe('latest-step')
      expect(r.color.ramp.mod).toBe(40)
    }
  })

  it('adds a second visited-neighbors overlay rule at reduced opacity when present', () => {
    const preset: ColoringPreset = {
      name: 't',
      colors: ['#111111', '#222222', '#333333'],
      attr: 'first-step',
      mod: 30,
      fade: 'smooth',
      overlay: { colors: ['#000000', '#ffffff'], opacity: 0.3 },
    }
    const rules = buildPresetRules(preset, makeId)
    expect(rules).toHaveLength(2)
    const [, overlay] = rules
    expect(overlay.predicate).toEqual({ kind: 'ref', id: 'visited' })
    expect(overlay.opacity).toBe(0.3)
    expect(overlay.color.kind).toBe('ramp')
    if (overlay.color.kind === 'ramp') {
      expect(overlay.color.ramp.attr).toBe('visited-neighbors')
      expect(overlay.color.ramp.mod).toBeNull()
      expect(overlay.color.ramp.stops).toEqual([
        { hex: '#000000', at: 0 },
        { hex: '#ffffff', at: 3 },
      ])
    }
  })

  it('gives every rule a distinct id', () => {
    counter = 0
    const withOverlay = COLORING_PRESETS.find((p) => p.overlay)!
    const rules = buildPresetRules(withOverlay, makeId)
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length)
  })
})

describe('pickRandomPreset / randomColoringRules', () => {
  it('picks by the injected random source and stays in range', () => {
    expect(pickRandomPreset(() => 0)).toBe(COLORING_PRESETS[0])
    expect(pickRandomPreset(() => 0.999999)).toBe(COLORING_PRESETS[COLORING_PRESETS.length - 1])
    // a degenerate rand() === 1 must still index a real preset
    expect(COLORING_PRESETS).toContain(pickRandomPreset(() => 1))
  })

  it('randomColoringRules builds valid rules for the picked preset', () => {
    counter = 0
    const rules = randomColoringRules(makeId, () => 0)
    expect(rules.length).toBeGreaterThanOrEqual(1)
    expect(rules[0].predicate).toEqual({ kind: 'ref', id: 'visited' })
  })
})

describe('every preset colorizes a visited tile end-to-end', () => {
  const sq = squareTiling(4, 4)
  const predicateText = new Map([['visited', 'visited > 0']])
  // A little visited neighbourhood so first-step / latest-step / visited-neighbors all have real values.
  let overlay: ReadonlyMap<string, TileState> = new Map()
  overlay = addVisit(overlay, 'sq:1,1', 3)
  overlay = addVisit(overlay, 'sq:1,2', 7)
  overlay = addVisit(overlay, 'sq:2,1', 12)

  it('produces a valid rgba() for a visited tile and skips unvisited tiles', () => {
    for (const preset of COLORING_PRESETS) {
      const rules = buildPresetRules(preset, makeId)
      const out = colorize(rules, predicateText, sq, overlay, new Map())
      const painted = out.get('sq:1,2')
      expect(painted, preset.name).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/)
      expect(out.has('sq:3,3'), `${preset.name} unvisited`).toBe(false)
    }
  })
})
