// Shared types for the tutorialization seam between the guided Workspace and the tutorial controller.
// Kept dependency-light so Workspace can import them without pulling in the overlay/controller.
import type { ColoringRule } from '../colorizer'

// A viewport-space rectangle (px), used to spotlight a specific tile the overlay can't find via DOM
// (tiles are Konva-drawn, not elements) — the canvas reports it, tracking pan/zoom/fit.
export type ScreenRect = { left: number; top: number; width: number; height: number }

// The observable snapshot the guided Workspace reports up to the controller whenever a relevant field
// changes — everything a chapter script needs to decide when to advance a step.
export type TutorialSignals = {
  leftOpen: 'traversers' | 'coloring' | null
  rightOpen: 'inspect' | 'initial' | null
  selectedIds: ReadonlyArray<string>
  seedCount: number
  step: number
  running: boolean
  // A run is live (runLive !== null) — i.e. the first Step/Play has initialised it.
  hasRun: boolean
  // A run has FINISHED naturally: it was live and every walker has died (runLive is a non-null empty
  // array). Distinct from a manual Step-pause (walkers still alive) — the "watch it finish" trigger.
  runEnded: boolean
  // The Traversers full-pane editor is open.
  editorOpen: boolean
  traverserCount: number
  // The first (in the tutorial: only) traverser definition's DSL text, for the semantic program match.
  firstTraverserText: string | null
  // Coloring-rule signals (for the colorings chapter): how many rules, the first rule's flat colour hex
  // (null when it's a ramp or there's no rule), and whether the first rule is a ramp/fade.
  coloringRuleCount: number
  firstRuleColorHex: string | null
  firstRuleIsRamp: boolean
}

// A one-shot scripted mutation applied when a step becomes active (keyed on the step id). Lets a chapter
// arrange the stage at specific beats — seed traverser definitions + place walkers, set the coloring,
// stop the run, or pre-fill the finished board — without the user doing it. All fields optional; only
// the ones present are applied. Plain data so the script stays declarative + unit-testable.
export type SceneSetup = {
  // Which left dock to open (mirrors the accordion). Omit to leave unchanged.
  openLeft?: 'traversers' | 'coloring' | null
  // Open this definition (by name) in the Traversers full-pane editor, so the user can SEE its code (e.g.
  // the pre-seeded `move straight` walker). Persists until another setup changes it. Omit to leave as-is.
  editTraverser?: string
  // Replace the traverser library with these definitions (name + DSL text).
  defs?: ReadonlyArray<{ name: string; text: string }>
  // Replace the placed walkers with these (tile id + definition name + optional explicit heading edge
  // number, e.g. 2 = south on a square). Settings (max-split etc.) come from the matching `defs` entry.
  seeds?: ReadonlyArray<{ tile: string; def: string; heading?: number }>
  // Replace the coloring rules with these.
  coloring?: ReadonlyArray<ColoringRule>
  // Discard the live run (as if Stop were pressed).
  stop?: boolean
  // Run the `seeds` to completion off-screen and show the finished board (so the colorings have data to
  // paint without the user pressing Play). Uses `defs` for each seed's program.
  prefill?: boolean
  // Start a LIVE run from the `seeds` when the step activates (as if the user pressed Play), so the board
  // fills in real time. Mutually exclusive with `prefill` (which jumps straight to the finished board).
  play?: boolean
}

// The config + callbacks a chapter view hands the Workspace to run it in guided mode. Presence of this
// prop is what puts the Workspace in tutorial mode (blank sandbox stores, docks closed, no gallery
// handoff). Keep the object identity stable across renders (memoize it) — Workspace also guards the
// signal callback behind a ref, but a stable handle avoids needless effect churn.
export type TutorialHandle = {
  onSignals: (sig: TutorialSignals) => void
  // Pause the run when it reaches this tick (the chapter's finale).
  stopAtStep?: number
  // A hidden coloring seeded once on mount so the pattern grows in colour (the user never opens the pane).
  coloring?: ReadonlyArray<ColoringRule>
  // Force the single sandbox traverser's name (so the editor's name field reads e.g. "Ouroboros").
  forceTraverserName?: string
  // A tile whose on-screen rect the canvas should report (so the overlay can highlight it — e.g. the
  // one the user must click). Its rect comes back through `onTileRect` and tracks pan/zoom/fit.
  spotlightTileId?: string
  onTileRect?: (rect: ScreenRect | null) => void
  // The current step's scripted stage setup, applied once when `key` (the step id) changes. Lets a
  // chapter arrange the stage at specific beats (seed/place walkers, set coloring, stop, pre-fill).
  scene?: { key: string; setup?: SceneSetup }
}
