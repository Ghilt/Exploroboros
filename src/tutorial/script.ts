// The chapter scripts that drive the guided walkthrough. A script is plain data: an ordered list of
// steps, each with the speech bubble(s) to show, which element the spotlight cuts a hole around, and a
// PURE `proceed` test over the Workspace signals (so advancement is unit-testable — see script.test.ts).
// The controller (useTutorialController) runs the state machine; the overlay renders it.

import { compileProgram, serializeProgram } from '../traverse'
import { buildPresetRules, type ColoringPreset } from '../data/coloringPresets'
import type { ColoringRule } from '../colorizer'
import type { TutorialSignals, SceneSetup } from './types'

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
  // A one-shot scripted stage setup applied when this step becomes active (seed/place walkers, set the
  // coloring, stop, pre-fill). See SceneSetup. Absent for steps that don't rearrange the stage.
  setup?: SceneSetup
}

export type TutorialScript = {
  chapterId: string
  // Pause the run at this tick (a chapter that ends on a fixed board). Omit when the run finishes
  // naturally (every walker traps), e.g. the colorings chapter.
  stopAtStep?: number
  // A hidden coloring seeded once on mount. Omit when the chapter drives coloring through step setups.
  coloring?: ReadonlyArray<ColoringRule>
  // Force the single sandbox traverser's name. Omit when the chapter names its own definitions.
  forceTraverserName?: string
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

// ---- chapter 2: colorings ----

// The chapter opens with this walker already placed: it just marches straight, so on its own it draws
// nothing until a coloring rule paints where it has been. Placed bottom-centre facing north so its run
// draws a clean vertical line up the middle of the 20×20 square. Named "forest_gump" — it just keeps
// running straight ahead.
const FOREST_GUMP = { name: 'forest_gump', text: 'move straight' }
const STRAIGHT_TILE = 'sq:0,10'

// The two walkers added late in the chapter, to show that rule ORDER and OPACITY matter. They're
// identical branching fills except one writes registry A and the other registry B, so two half-opacity
// registry fades blend where the walkers overlap.
const SOFTIE_A = {
  name: 'softie-A',
  text: `max-split = 3

directive if visited.target != 0 always forbid move

put A = A + 2

if steps % 8 < 4 then move [straight, r1.l1, l1.r1]
if steps % 8 >= 4 and (A.r2.r1 == 0 or A.r2.l1 == 0) then move [straight, r1.l1, l1.r1]`,
}
const SOFTIE_B = {
  name: 'softie-B',
  text: `max-split = 3

directive if visited.target != 0 always forbid move

put B = B + 2

if steps % 8 < 4 then move [straight, r1.l1, l1.r1]
if steps % 8 >= 4 and (B.r2.r1 == 0 or B.r2.l1 == 0) then move [straight, r1.l1, l1.r1]`,
}

// The coloring set revealed at the ordering step: a cool fade and a warm fade, each keyed to one of the
// registry-writing walkers (has-a / has-b) but fading over LATEST-STEP (when a tile was most recently
// reached), so the pattern animates as the run plays out. The TOP rule (has-a) is fully opaque; the
// second (has-b) is at half opacity, so it blends over the first where the walkers overlap. A plain
// opaque rule LAST — which, since rules composite top→bottom with the last one on top, covers everything
// until the user deletes it. Fixed ids so the rules stay stable across renders.
const CH2_COLORING: ReadonlyArray<ColoringRule> = [
  {
    id: 'tut2-reg-a',
    predicate: { kind: 'ref', id: 'has-a' },
    color: { kind: 'ramp', ramp: { attr: 'latest-step', mod: 24, stops: [{ hex: '#16b5c9', at: null }, { hex: '#2f6fe0', at: null }, { hex: '#7b3fd4', at: null }] } },
    opacity: 1,
  },
  {
    id: 'tut2-reg-b',
    predicate: { kind: 'ref', id: 'has-b' },
    color: { kind: 'ramp', ramp: { attr: 'latest-step', mod: 24, stops: [{ hex: '#f5c542', at: null }, { hex: '#f2802a', at: null }, { hex: '#e0407f', at: null }] } },
    opacity: 0.5,
  },
  {
    id: 'tut2-cover',
    predicate: { kind: 'ref', id: 'visited' },
    color: { kind: 'flat', hex: '#2b2b3a' },
    opacity: 1,
  },
]

// The default flat colour a fresh rule is seeded with (coloringStore.makeRule) — the pick-color step
// advances once the user changes it to anything else.
const DEFAULT_RULE_HEX = '#e2682a'

export const COLORINGS: TutorialScript = {
  chapterId: 'colorings',
  steps: [
    {
      id: 'welcome',
      bubbles: [
        {
          text: 'Welcome to the chapter on colorings.\n\nTraversers and coloring rules together are what paint the canvas.',
          anchor: 'center',
        },
      ],
      hole: 'none',
      reveal: ['canvas'],
      proceed: { on: 'click' },
      narration: true,
      blockHint: '',
      // Open the Traversers pane, open the straight walker in its editor (so its `move straight` code is
      // visible while the next step talks about it), and pre-place it on a blank board.
      setup: {
        openLeft: 'traversers',
        editTraverser: FOREST_GUMP.name,
        defs: [FOREST_GUMP],
        seeds: [{ tile: STRAIGHT_TILE, def: FOREST_GUMP.name, heading: 0 }],
      },
    },
    {
      id: 'open-coloring',
      bubbles: [
        {
          text: 'Look at this traverser. It just moves straight ahead every tick. If we ran it now, it would not even show up on the canvas.\n\nClick the Coloring tab. That is where we decide how to present the canvas after the traverser has run across it.',
          anchor: { tut: 'coloring' },
          placement: 'right',
        },
      ],
      hole: { tut: 'coloring' },
      reveal: [{ tut: 'traversers' }, { tut: 'coloring' }],
      proceed: { on: 'signal', test: (s) => s.leftOpen === 'coloring' },
      blockHint: 'Open the Coloring tab on the left.',
    },
    {
      id: 'add-rule',
      bubbles: [{ text: 'Click “+ Add rule”.', anchor: { tut: 'add-coloring-rule' }, placement: 'right' }],
      hole: { tut: 'add-coloring-rule' },
      reveal: [{ tut: 'coloring' }],
      proceed: { on: 'signal', test: (s) => s.coloringRuleCount >= 1 },
      blockHint: 'Click “+ Add rule” to create a coloring rule.',
    },
    {
      id: 'pick-color',
      bubbles: [
        {
          text: 'Now we have a rule. It comes prefilled with a basic coloring that says:\n\n“If a traverser has visited a tile, color it with a chosen color.”\n\nChange that color now. Pick whatever you like.',
          // Emanate from the whole Coloring pane (so the bubble doesn't cover the rule); the ring still
          // highlights the swatch (the hole).
          anchor: { tut: 'coloring' },
          placement: 'right',
        },
      ],
      hole: { tut: 'rule-swatch' },
      reveal: [{ tut: 'coloring' }],
      proceed: { on: 'signal', test: (s) => s.firstRuleColorHex !== null && s.firstRuleColorHex.toLowerCase() !== DEFAULT_RULE_HEX },
      blockHint: 'Click the color swatch and pick a color.',
    },
    {
      id: 'play-1',
      bubbles: [{ text: 'Press Play to see the coloring rule in action.', anchor: { tut: 'play' }, placement: 'bottom' }],
      hole: { tut: 'play' },
      reveal: ['canvas'],
      proceed: { on: 'signal', test: (s) => s.hasRun },
      blockHint: 'Press Play to run the traverser.',
    },
    {
      id: 'watch-1',
      bubbles: [{ text: 'There it goes! Nice shade you found.', anchor: 'canvas-top' }],
      hole: 'none',
      reveal: ['canvas'],
      ring: 'none',
      proceed: { on: 'signal', test: (s) => s.runEnded },
      blockHint: 'Let it finish crossing the plane.',
    },
    {
      id: 'add-color',
      bubbles: [
        {
          text: 'We can make it nicer by adding more colors. Press the plus icon to turn the single color into a color fade.',
          // From the pane, not over the + icon (which the ring still highlights via the hole).
          anchor: { tut: 'coloring' },
          placement: 'right',
        },
      ],
      hole: { tut: 'add-color' },
      reveal: [{ tut: 'coloring' }, 'canvas'],
      proceed: { on: 'signal', test: (s) => s.firstRuleIsRamp },
      blockHint: 'Press the + next to the color to add a second one.',
    },
    {
      id: 'play-2',
      bubbles: [
        {
          text: 'To fade from one color to another, the coloring needs a tile attribute to base the fade on. The default, Latest Step, colors each tile by when the traverser most recently reached it.\n\nThe Modulo (%) value sets how often the pattern repeats. It is one of the most fun settings to play with, since small changes can transform the whole look.\n\nPress Play to see how it turns out.',
          // Emanate from the Coloring pane (the fade controls live there) rather than the Play button, so
          // the long explanation doesn't cover the pane; the ring still marks Play (the hole).
          anchor: { tut: 'coloring' },
          placement: 'right',
        },
      ],
      hole: { tut: 'play' },
      reveal: [{ tut: 'coloring' }, 'canvas'],
      proceed: { on: 'signal', test: (s) => s.runEnded },
      blockHint: 'Press Play to run it again.',
      // Clear the previous run so Play starts fresh and shows the fade from the beginning.
      setup: { stop: true },
    },
    {
      id: 'stop-to-add',
      bubbles: [
        {
          text: 'Lovely. Next I will show you something about the order of colors. When you press Stop, I will add a couple of new traversers to help us see it.',
          anchor: { tut: 'stop' },
          placement: 'bottom',
        },
      ],
      hole: { tut: 'stop' },
      reveal: [{ tut: 'coloring' }, 'canvas'],
      proceed: { on: 'signal', test: (s) => !s.hasRun },
      blockHint: 'Press Stop to clear the run.',
    },
    {
      id: 'ordering',
      bubbles: [
        {
          text: 'Watch the two new walkers fill the board. Each one writes to its own registry, A and B, and I gave each a color fade based on the latest step.\n\nColoring rules stack top to bottom, and a rule paints over the ones above it. The top fade is fully opaque; the one below it is semi-transparent, so it blends where the walkers overlap.\n\nRight now a plain rule at the bottom is painting over everything. Delete that bottom rule to reveal the two fades underneath.',
          anchor: { tut: 'coloring' },
          placement: 'right',
        },
      ],
      hole: { tut: 'coloring' },
      reveal: [{ tut: 'coloring' }, 'canvas'],
      proceed: { on: 'signal', test: (s) => s.coloringRuleCount === 2 },
      blockHint: 'Delete the bottom coloring rule (its trash icon).',
      // Keep forest_gump in the library, add the two softies, place them at the top corners facing down,
      // color by the A/B latest-step fades (+ a covering rule), and PLAY the run live so the user watches
      // the board fill (rather than a pre-filled static board).
      setup: {
        defs: [FOREST_GUMP, SOFTIE_A, SOFTIE_B],
        seeds: [
          { tile: 'sq:19,0', def: SOFTIE_A.name, heading: 2 },
          { tile: 'sq:19,19', def: SOFTIE_B.name, heading: 2 },
        ],
        coloring: CH2_COLORING,
        play: true,
      },
    },
    {
      id: 'finale',
      bubbles: [
        {
          text: 'That is a wrap on colorings! You have seen how traversers lay down data and coloring rules turn it into something beautiful. Now go make something wonderful.',
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
  [COLORINGS.chapterId]: COLORINGS,
}

export function getScript(chapterId: string): TutorialScript | null {
  return SCRIPTS[chapterId] ?? null
}
