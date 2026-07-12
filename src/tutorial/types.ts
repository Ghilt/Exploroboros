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
  // The Traversers full-pane editor is open.
  editorOpen: boolean
  traverserCount: number
  // The first (in the tutorial: only) traverser definition's DSL text, for the semantic program match.
  firstTraverserText: string | null
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
}
