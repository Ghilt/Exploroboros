import { describe, it, expect } from 'vitest'
import { BASIC_TRAVERSER, COLORINGS, CENTER_TILE, TARGET_PROGRAM, getScript, programMatchesTarget, type TutorialStep } from './script'
import { compileProgram } from '../traverse'
import type { TutorialSignals } from './types'

const BASE: TutorialSignals = {
  leftOpen: null,
  rightOpen: null,
  selectedIds: [],
  seedCount: 0,
  step: 0,
  running: false,
  hasRun: false,
  runEnded: false,
  editorOpen: false,
  traverserCount: 0,
  firstTraverserText: null,
  coloringRuleCount: 0,
  firstRuleColorHex: null,
  firstRuleIsRamp: false,
}
const sig = (o: Partial<TutorialSignals>): TutorialSignals => ({ ...BASE, ...o })
const stepById = (id: string): TutorialStep => {
  const s = BASIC_TRAVERSER.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s
}
// True only when a SIGNAL step's pure test passes for these signals.
const advances = (id: string, s: TutorialSignals): boolean => {
  const st = stepById(id)
  return st.proceed.on === 'signal' && st.proceed.test(s)
}

describe('programMatchesTarget (semantic match)', () => {
  it('accepts the exact target text', () => {
    expect(programMatchesTarget(TARGET_PROGRAM)).toBe(true)
  })
  it('accepts harmless reformatting (no blank line, no spaces around =)', () => {
    expect(programMatchesTarget('max-split=2\nmove l1\nmove r1')).toBe(true)
  })
  it('accepts extra surrounding whitespace', () => {
    expect(programMatchesTarget('\n\nmax-split = 2\n\nmove l1\nmove r1\n\n')).toBe(true)
  })
  it('rejects a different program', () => {
    expect(programMatchesTarget('move r1')).toBe(false)
    expect(programMatchesTarget('max-split = 2\nmove l1')).toBe(false) // missing move r1
  })
  it('rejects empty / null / non-compiling input', () => {
    expect(programMatchesTarget(null)).toBe(false)
    expect(programMatchesTarget('')).toBe(false)
    expect(programMatchesTarget('this is not a program {{')).toBe(false)
  })
})

describe('getScript', () => {
  it('returns the basic-traverser script', () => {
    expect(getScript('basic-traverser')).toBe(BASIC_TRAVERSER)
  })
  it('returns null for an unknown chapter', () => {
    expect(getScript('nope')).toBeNull()
  })
})

describe('BASIC_TRAVERSER shape', () => {
  it('pins the chapter constants', () => {
    expect(BASIC_TRAVERSER.chapterId).toBe('basic-traverser')
    expect(BASIC_TRAVERSER.stopAtStep).toBe(21)
    expect(BASIC_TRAVERSER.forceTraverserName).toBe('Ouroboros')
    expect(CENTER_TILE).toBe('sq:10,10')
  })
  it('reveals the canvas (visible, not clickable) during the step/play + select steps', () => {
    for (const id of ['select-tile', 'step-1', 'step-2', 'step-3', 'play', 'finale']) {
      expect(stepById(id).reveal).toContain('canvas')
    }
  })
  it('highlights the spotlight tile on the select step', () => {
    expect(stepById('select-tile').ring).toBe('tile')
    expect(BASIC_TRAVERSER.spotlightTileId).toBe(CENTER_TILE)
  })
  it('keeps the Traversers pane visible while closing it (whole title row is the target)', () => {
    const close = stepById('close-editor')
    expect(close.reveal).toContainEqual({ tut: 'traversers' })
    expect(close.hole).toEqual({ tut: 'traversers-head' })
  })
  it('seeds a well-formed hidden coloring', () => {
    const coloring = BASIC_TRAVERSER.coloring ?? []
    expect(coloring.length).toBeGreaterThan(0)
    for (const r of coloring) {
      expect(r.predicate).toBeTruthy()
      expect(r.color).toBeTruthy()
      expect(typeof r.id).toBe('string')
    }
  })
  it('every step has at least one bubble and a block hint or narration', () => {
    for (const s of BASIC_TRAVERSER.steps) {
      expect(s.bubbles.length).toBeGreaterThan(0)
      expect(s.narration || s.blockHint.length > 0).toBe(true)
    }
  })
  it('starts and ends with a narration (click) step; finale is last', () => {
    const first = BASIC_TRAVERSER.steps[0]
    const finale = BASIC_TRAVERSER.steps[BASIC_TRAVERSER.steps.length - 1]
    expect(first.proceed.on).toBe('click')
    expect(finale.proceed.on).toBe('click')
    expect(finale.finale).toBe(true)
  })
})

describe('step advance conditions', () => {
  it('welcome is a narration step (never signal-advances)', () => {
    expect(stepById('welcome').proceed.on).toBe('click')
  })

  it('open-traversers advances only once the Traversers pane is open', () => {
    expect(advances('open-traversers', BASE)).toBe(false)
    expect(advances('open-traversers', sig({ leftOpen: 'coloring' }))).toBe(false)
    expect(advances('open-traversers', sig({ leftOpen: 'traversers' }))).toBe(true)
  })

  it('click-new advances once a traverser exists', () => {
    expect(advances('click-new', BASE)).toBe(false)
    expect(advances('click-new', sig({ traverserCount: 1 }))).toBe(true)
  })

  it('write-program advances only when the program matches', () => {
    expect(advances('write-program', sig({ firstTraverserText: 'move r1' }))).toBe(false)
    expect(advances('write-program', sig({ firstTraverserText: TARGET_PROGRAM }))).toBe(true)
  })

  it('close-editor advances only when the whole Traversers panel is closed', () => {
    // The user closes the ENTIRE pane (not just the editor), so the gate is on leftOpen, not editorOpen.
    expect(advances('close-editor', sig({ leftOpen: 'traversers', editorOpen: true }))).toBe(false)
    expect(advances('close-editor', sig({ leftOpen: null, editorOpen: true }))).toBe(true)
  })

  it('select-tile advances only on the centre tile; a wrong tile does not', () => {
    expect(stepById('select-tile').expectTileSelect).toBe(CENTER_TILE)
    expect(advances('select-tile', sig({ selectedIds: ['sq:0,0'] }))).toBe(false)
    expect(advances('select-tile', sig({ selectedIds: [CENTER_TILE] }))).toBe(true)
    // two tiles selected is not the single centre selection
    expect(advances('select-tile', sig({ selectedIds: [CENTER_TILE, 'sq:0,0'] }))).toBe(false)
  })

  it('place-traverser advances once a walker is placed', () => {
    expect(advances('place-traverser', BASE)).toBe(false)
    expect(advances('place-traverser', sig({ seedCount: 1 }))).toBe(true)
  })

  it('the step narrative advances at hasRun, step 1, step 2, then tick 21', () => {
    // step-1: the run must have been initialised
    expect(advances('step-1', sig({ hasRun: false }))).toBe(false)
    expect(advances('step-1', sig({ hasRun: true }))).toBe(true)
    // step-2 at tick >= 1 (walker split into two)
    expect(advances('step-2', sig({ step: 0 }))).toBe(false)
    expect(advances('step-2', sig({ step: 1 }))).toBe(true)
    // step-3 at tick >= 2 (four walkers)
    expect(advances('step-3', sig({ step: 1 }))).toBe(false)
    expect(advances('step-3', sig({ step: 2 }))).toBe(true)
    // play → finale at the stop tick
    expect(advances('play', sig({ step: 20 }))).toBe(false)
    expect(advances('play', sig({ step: 21 }))).toBe(true)
  })
})

// ---- chapter 2: colorings ----
const colStep = (id: string): TutorialStep => {
  const s = COLORINGS.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no colorings step ${id}`)
  return s
}
const colAdvances = (id: string, s: TutorialSignals): boolean => {
  const st = colStep(id)
  return st.proceed.on === 'signal' && st.proceed.test(s)
}

describe('COLORINGS chapter registration + shape', () => {
  it('is registered under its id', () => {
    expect(getScript('colorings')).toBe(COLORINGS)
    expect(COLORINGS.chapterId).toBe('colorings')
  })
  it('runs to a natural finish (no fixed stop tick) and seeds no mount coloring', () => {
    expect(COLORINGS.stopAtStep).toBeUndefined()
    expect(COLORINGS.coloring).toBeUndefined()
    expect(COLORINGS.forceTraverserName).toBeUndefined()
  })
  it('starts on narration and ends on the finale', () => {
    expect(COLORINGS.steps[0].proceed.on).toBe('click')
    const last = COLORINGS.steps[COLORINGS.steps.length - 1]
    expect(last.finale).toBe(true)
    expect(last.proceed.on).toBe('click')
  })
  it('every step has a bubble and a block hint or narration', () => {
    for (const s of COLORINGS.steps) {
      expect(s.bubbles.length).toBeGreaterThan(0)
      expect(s.narration || s.blockHint.length > 0).toBe(true)
    }
  })
})

describe('COLORINGS scripted stage setups', () => {
  it('welcome opens the Traversers pane and pre-places forest_gump', () => {
    const setup = colStep('welcome').setup
    expect(setup?.openLeft).toBe('traversers')
    expect(setup?.defs?.map((d) => d.name)).toEqual(['forest_gump'])
    expect(setup?.seeds).toEqual([{ tile: 'sq:0,10', def: 'forest_gump', heading: 0 }])
    expect(setup?.coloring).toBeUndefined() // pane starts empty; the user adds the first rule
  })
  it('welcome opens forest_gump in the editor so its code is visible', () => {
    expect(colStep('welcome').setup?.editTraverser).toBe('forest_gump')
  })
  it('the coloring-control bubbles emanate from the Coloring pane while the hole marks the real control', () => {
    // The bubble is anchored to the whole pane (so it doesn't cover the rule), but the clickable hole —
    // which the ring follows — stays on the specific control the step is about.
    for (const [id, control] of [
      ['pick-color', 'rule-swatch'],
      ['add-color', 'add-color'],
      ['play-2', 'play'],
    ] as const) {
      expect(colStep(id).bubbles[0].anchor).toEqual({ tut: 'coloring' })
      expect(colStep(id).hole).toEqual({ tut: control })
    }
  })
  it('play-2 stops the previous run so Play starts fresh', () => {
    expect(colStep('play-2').setup?.stop).toBe(true)
  })
  it('ordering adds the two softies (keeping forest_gump), places them facing down, and plays live', () => {
    const setup = colStep('ordering').setup
    expect(setup?.defs?.map((d) => d.name)).toEqual(['forest_gump', 'softie-A', 'softie-B'])
    expect(setup?.seeds).toEqual([
      { tile: 'sq:19,0', def: 'softie-A', heading: 2 },
      { tile: 'sq:19,19', def: 'softie-B', heading: 2 },
    ])
    // Play the run live (watch it fill) rather than jumping to a pre-filled board.
    expect(setup?.play).toBe(true)
    expect(setup?.prefill).toBeUndefined()
  })
  it('the ordering coloring is two latest-step fades (top opaque, second half) then an opaque cover LAST', () => {
    const rules = colStep('ordering').setup?.coloring ?? []
    expect(rules.length).toBe(3)
    // both fades are over latest-step now (not the registry value); the TOP rule is fully opaque, the
    // second is half opacity so it blends over the first where the walkers overlap
    expect(rules[0].color).toMatchObject({ kind: 'ramp', ramp: { attr: 'latest-step' } })
    expect(rules[0].opacity).toBe(1)
    expect(rules[1].color).toMatchObject({ kind: 'ramp', ramp: { attr: 'latest-step' } })
    expect(rules[1].opacity).toBe(0.5)
    // the covering rule is LAST (composited on top) and opaque — the one the user deletes
    expect(rules[2].color).toEqual({ kind: 'flat', hex: '#2b2b3a' })
    expect(rules[2].opacity).toBe(1)
  })
  it('every seeded traverser program compiles', () => {
    const texts = new Map<string, string>()
    for (const s of COLORINGS.steps) for (const d of s.setup?.defs ?? []) texts.set(d.name, d.text)
    expect(texts.size).toBe(3)
    for (const [name, text] of texts) {
      const c = compileProgram(text, new Map())
      expect(c.ok, `${name} should compile: ${c.ok ? '' : c.error.message}`).toBe(true)
    }
  })
  it('the softies fan (max-split 3) and write their registries', () => {
    const texts = new Map<string, string>()
    for (const s of COLORINGS.steps) for (const d of s.setup?.defs ?? []) texts.set(d.name, d.text)
    for (const name of ['softie-A', 'softie-B']) {
      const c = compileProgram(texts.get(name)!, new Map())
      expect(c.ok).toBe(true)
      if (c.ok) expect(c.value.settings.maxSplit).toBe(3)
    }
  })
})

describe('COLORINGS step advance conditions', () => {
  it('open-coloring advances only once the Coloring pane is open', () => {
    expect(colAdvances('open-coloring', sig({ leftOpen: 'traversers' }))).toBe(false)
    expect(colAdvances('open-coloring', sig({ leftOpen: 'coloring' }))).toBe(true)
  })
  it('add-rule advances once a coloring rule exists', () => {
    expect(colAdvances('add-rule', BASE)).toBe(false)
    expect(colAdvances('add-rule', sig({ coloringRuleCount: 1 }))).toBe(true)
  })
  it('pick-color advances only when the colour differs from the default', () => {
    expect(colAdvances('pick-color', sig({ firstRuleColorHex: '#e2682a' }))).toBe(false)
    expect(colAdvances('pick-color', sig({ firstRuleColorHex: null }))).toBe(false)
    expect(colAdvances('pick-color', sig({ firstRuleColorHex: '#3366ff' }))).toBe(true)
  })
  it('play-1 advances once the run is live', () => {
    expect(colAdvances('play-1', BASE)).toBe(false)
    expect(colAdvances('play-1', sig({ hasRun: true }))).toBe(true)
  })
  it('watch-1 and play-2 advance only when the run has finished naturally', () => {
    expect(colAdvances('watch-1', sig({ hasRun: true, running: true }))).toBe(false)
    expect(colAdvances('watch-1', sig({ hasRun: true, runEnded: true }))).toBe(true)
    expect(colAdvances('play-2', sig({ hasRun: true, runEnded: true }))).toBe(true)
  })
  it('add-color advances once the rule is a ramp', () => {
    expect(colAdvances('add-color', sig({ firstRuleIsRamp: false }))).toBe(false)
    expect(colAdvances('add-color', sig({ firstRuleIsRamp: true }))).toBe(true)
  })
  it('stop-to-add advances when the run is discarded (no live run)', () => {
    expect(colAdvances('stop-to-add', sig({ hasRun: true, runEnded: true }))).toBe(false)
    expect(colAdvances('stop-to-add', sig({ hasRun: false }))).toBe(true)
  })
  it('ordering advances once the covering rule is deleted (two rules left)', () => {
    expect(colAdvances('ordering', sig({ coloringRuleCount: 3 }))).toBe(false)
    expect(colAdvances('ordering', sig({ coloringRuleCount: 2 }))).toBe(true)
  })
})
