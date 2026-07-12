import { describe, it, expect } from 'vitest'
import { BASIC_TRAVERSER, CENTER_TILE, TARGET_PROGRAM, getScript, programMatchesTarget, type TutorialStep } from './script'
import type { TutorialSignals } from './types'

const BASE: TutorialSignals = {
  leftOpen: null,
  rightOpen: null,
  selectedIds: [],
  seedCount: 0,
  step: 0,
  running: false,
  hasRun: false,
  editorOpen: false,
  traverserCount: 0,
  firstTraverserText: null,
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
    expect(BASIC_TRAVERSER.coloring.length).toBeGreaterThan(0)
    for (const r of BASIC_TRAVERSER.coloring) {
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
