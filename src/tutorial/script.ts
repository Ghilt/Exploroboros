// The chapter scripts that drive the guided walkthrough. A script is plain data: an ordered list of
// steps, each with the speech bubble(s) to show, which element the spotlight cuts a hole around, and a
// PURE `proceed` test over the Workspace signals (so advancement is unit-testable — see script.test.ts).
// The controller (useTutorialController) runs the state machine; the overlay renders it.

import { compileProgram, serializeProgram } from '../traverse'
import { buildPresetRules, type ColoringPreset } from '../data/coloringPresets'
import type { ColoringRule } from '../colorizer'
import type { TutorialSignals } from './types'

// Where a bubble sits. `center` = viewport-centred card (opening/finale narration); `canvas-top` = the
// upper-centre of the canvas (so the tile the user must click below stays visible); `{tut}` = anchored to
// that data-tut element with a tail, auto-placed to the roomier side (override with `placement`).
export type BubbleAnchor = 'center' | 'canvas-top' | { tut: string }

export type Bubble = {
  text: string
  // An optional monospace code block rendered under the text (e.g. the program to type).
  code?: string
  anchor: BubbleAnchor
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

// How a step advances: a narration step waits for the user to CLICK the overlay; a signal step advances
// when its pure predicate over the current Workspace signals becomes true.
export type StepProceed = { on: 'click' } | { on: 'signal'; test: (sig: TutorialSignals) => boolean }

// A region reference the overlay can resolve to a rect: the whole canvas, or a data-tut element.
export type Region = 'canvas' | { tut: string }

export type TutorialStep = {
  id: string
  bubbles: Bubble[]
  // The CLICKABLE region — where clicks pass through to the real UI: 'none' (narration — nothing
  // clickable, the whole overlay advances on click), 'canvas' (tap tiles freely), or a data-tut element.
  // Everything outside the hole is click-blocked (but not necessarily dimmed — see `reveal`).
  hole: 'none' | 'canvas' | { tut: string }
  // Regions kept VISIBLE (undimmed) beyond the hole — visible but NOT clickable. So the user can watch
  // the canvas while the Step button is the only click target, or see the whole pane while one control
  // in it is clickable. The hole is always visible; default is just the hole.
  reveal?: ReadonlyArray<Region>
  // Where the pulsing highlight ring draws: the hole (default), the spotlight TILE, or nowhere.
  ring?: 'hole' | 'tile' | 'none'
  proceed: StepProceed
  // Inline message shown when the user clicks a blocked region.
  blockHint: string
  // The select step: a tile tap that isn't this id shows the wrong-tile message instead of advancing.
  expectTileSelect?: string
  // Narration bubble → show a "click to continue" affordance (and the whole overlay advances on click).
  narration?: boolean
  // The celebratory final step (fireworks; a click completes the chapter + returns to the tutorial).
  finale?: boolean
}

export type TutorialScript = {
  chapterId: string
  stopAtStep: number
  coloring: ReadonlyArray<ColoringRule>
  forceTraverserName: string
  // A tile the canvas should report the on-screen rect of, for the `ring: 'tile'` highlight.
  spotlightTileId?: string
  steps: TutorialStep[]
}

// ---- chapter 1: basic traverser ----

// The chapter pins the square tiling at 20×20 (the Workspace defaults), so the centre tile is fixed.
export const CENTER_TILE = 'sq:10,10'

// The program the user types/pastes. Matching is SEMANTIC (below), so incidental whitespace differences
// are fine.
export const TARGET_PROGRAM = 'max-split = 2\n\nmove l1\nmove r1'

// Canonical serialization of a program, or null if it doesn't compile. Comparing canonical forms means
// "means the same program" rather than "same keystrokes" — the exact text matches, and so does any
// harmless reformatting (spacing, blank lines, `=` spacing); a not-yet-valid draft simply doesn't match.
function canonical(text: string): string | null {
  const r = compileProgram(text, new Map())
  return r.ok ? serializeProgram(r.value) : null
}
const TARGET_CANON = canonical(TARGET_PROGRAM)

export function programMatchesTarget(text: string | null): boolean {
  if (!text || TARGET_CANON === null) return false
  return canonical(text) === TARGET_CANON
}

// The hidden gradient: a smooth ramp over first-step (the tick a tile was first reached), so the pattern
// blooms from the centre in colour as the walkers fill outward. Built once (module scope → stable ids)
// with the app's own preset builder, so it's exactly a normal coloring rule. mod 28 > the ~21-tick fill
// depth, so the palette spans the whole growth without wrapping (centre → purple, edge → gold).
const TUTORIAL_PRESET: ColoringPreset = {
  name: 'tutorial-bloom',
  colors: ['#6d2b8f', '#c0398e', '#e2682a', '#f2c14e'],
  attr: 'first-step',
  mod: 28,
  fade: 'smooth',
}
let colorSeq = 0
const BASIC_TRAVERSER_COLORING = buildPresetRules(TUTORIAL_PRESET, () => `tut-color-${colorSeq++}`)

export const BASIC_TRAVERSER: TutorialScript = {
  chapterId: 'basic-traverser',
  stopAtStep: 21,
  coloring: BASIC_TRAVERSER_COLORING,
  forceTraverserName: 'Ouroboros',
  spotlightTileId: CENTER_TILE,
  steps: [
    {
      id: 'welcome',
      bubbles: [
        {
          text: 'Welcome to Exploroboros. This is the main space where you explore creating fractals, or whatever you like.',
          anchor: 'center',
        },
      ],
      hole: 'none',
      proceed: { on: 'click' },
      narration: true,
      blockHint: '',
    },
    {
      id: 'open-traversers',
      bubbles: [{ text: 'Let’s start by creating a traverser. Open the Traversers panel.', anchor: { tut: 'traversers' }, placement: 'right' }],
      hole: { tut: 'traversers' },
      proceed: { on: 'signal', test: (s) => s.leftOpen === 'traversers' },
      blockHint: 'First, open the Traversers panel on the left.',
    },
    {
      id: 'click-new',
      bubbles: [{ text: 'Click “+ New” to make one.', anchor: { tut: 'new-traverser' }, placement: 'right' }],
      hole: { tut: 'new-traverser' },
      reveal: [{ tut: 'traversers' }],
      proceed: { on: 'signal', test: (s) => s.traverserCount >= 1 },
      blockHint: 'Click “+ New” to create your traverser.',
    },
    {
      id: 'write-program',
      bubbles: [
        {
          text: 'Its name can be anything you like. For this chapter it’s fixed to “Ouroboros”.',
          anchor: { tut: 'trav-name' },
          placement: 'right',
        },
        {
          text: 'Here we write simple steps telling the traverser what to do each “tick”. Type the following instructions into the box:',
          code: TARGET_PROGRAM,
          anchor: { tut: 'trav-code' },
          placement: 'right',
        },
      ],
      hole: { tut: 'trav-code' },
      reveal: [{ tut: 'traversers' }],
      proceed: { on: 'signal', test: (s) => programMatchesTarget(s.firstTraverserText) },
      blockHint: 'Type the three lines into the code box to continue.',
    },
    {
      id: 'close-editor',
      bubbles: [
        {
          text: 'Great!\n\nThe code we just wrote tells the traverser that it may split into two. On each simulation tick, one instance steps along the left edge while the other steps along the right edge. Because the traverser has two move commands, it splits into two instances: one follows the left path, and the other follows the right.\n\nNow close the whole Traversers panel by clicking its title bar.',
          anchor: { tut: 'traversers-head' },
          placement: 'right',
        },
      ],
      hole: { tut: 'traversers-head' },
      reveal: [{ tut: 'traversers' }],
      proceed: { on: 'signal', test: (s) => s.leftOpen !== 'traversers' },
      blockHint: 'Click the “Traversers” title bar to close the panel.',
    },
    {
      id: 'select-tile',
      bubbles: [{ text: 'To place the traverser we just made, click the highlighted tile in the middle of the plane!', anchor: 'canvas-top' }],
      hole: 'canvas',
      reveal: ['canvas'],
      ring: 'tile',
      proceed: { on: 'signal', test: (s) => s.selectedIds.length === 1 && s.selectedIds[0] === CENTER_TILE },
      expectTileSelect: CENTER_TILE,
      blockHint: 'Click the highlighted tile in the middle of the plane.',
    },
    {
      id: 'place-traverser',
      bubbles: [
        {
          text: 'This is the Inspect panel. It shows information about a tile and lets you act on it. Click here to place your traverser on this tile.',
          anchor: { tut: 'place' },
          placement: 'left',
        },
      ],
      hole: { tut: 'place' },
      reveal: [{ tut: 'inspect' }],
      proceed: { on: 'signal', test: (s) => s.seedCount >= 1 },
      blockHint: 'Click “Place” to drop your traverser on the tile.',
    },
    {
      id: 'step-1',
      bubbles: [{ text: 'Let’s send the little guy going! This is the Step button. It advances the simulation by one tick.', anchor: { tut: 'step' }, placement: 'bottom' }],
      hole: { tut: 'step' },
      reveal: ['canvas'],
      proceed: { on: 'signal', test: (s) => s.hasRun },
      blockHint: 'Press the Step button to advance one tick.',
    },
    {
      id: 'step-2',
      bubbles: [{ text: 'Nice! First tick, it just got dropped on the board. Again!', anchor: { tut: 'step' }, placement: 'bottom' }],
      hole: { tut: 'step' },
      reveal: ['canvas'],
      proceed: { on: 'signal', test: (s) => s.step >= 1 },
      blockHint: 'Press Step again.',
    },
    {
      id: 'step-3',
      bubbles: [{ text: 'They just split into two, just like we planned. Can you guess what happens if you press it again?', anchor: { tut: 'step' }, placement: 'bottom' }],
      hole: { tut: 'step' },
      reveal: ['canvas'],
      proceed: { on: 'signal', test: (s) => s.step >= 2 },
      blockHint: 'Press Step once more.',
    },
    {
      id: 'play',
      bubbles: [{ text: 'Now we’ve got four. Incredible. Let’s hit play and run the simulation.', anchor: { tut: 'play' }, placement: 'bottom' }],
      hole: { tut: 'play' },
      reveal: ['canvas'],
      proceed: { on: 'signal', test: (s) => s.step >= 21 },
      blockHint: 'Press Play to let it run.',
    },
    {
      id: 'finale',
      bubbles: [
        {
          text: 'Beautiful! You’ve finished this chapter! I’m really proud of you. To discover how the board got its beautiful colors, continue to the chapter on Colorings!',
          anchor: 'center',
        },
      ],
      hole: 'none',
      reveal: ['canvas'],
      ring: 'none',
      proceed: { on: 'click' },
      narration: true,
      finale: true,
      blockHint: '',
    },
  ],
}

const SCRIPTS: Record<string, TutorialScript> = {
  [BASIC_TRAVERSER.chapterId]: BASIC_TRAVERSER,
}

export function getScript(chapterId: string): TutorialScript | null {
  return SCRIPTS[chapterId] ?? null
}
