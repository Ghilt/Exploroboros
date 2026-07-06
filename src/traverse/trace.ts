// An OPT-IN, per-tick decision trace — the data behind the debug log. Pure & isomorphic (no
// React/DOM/Konva) like the rest of src/traverse. It mirrors the engine's evaluation structure 1:1
// (a TickTrace per tick → a TraverserTrace per walker → a StmtTrace per statement → CandidateTraces
// per move chain), so the log can explain exactly why a walker did — or did NOT — move, and which
// tile each guard/decoration read. Built only when a trace sink is passed to computeTick/runProgram
// (see step.ts / exec.ts); the export run never passes one, so it stays zero-cost there.

import type { Movement } from './lang'

// One tile an attribute in a guard read via its `@`-path — the heart of "why didn't it move onto the
// wedge". `role` is `target` for the move destination (`@target`) or `read` for a fixed edge/tile path;
// `id` is null when the path hit a boundary / missing tile. `text` is the path label (`@e1`, `@target`).
export type ReadTile = {
  id: string | null
  role: 'read' | 'target'
  tileType: string | null
  text: string
}

// One predicate evaluation: the guard text, every NEIGHBOUR tile its attributes read via an `@`-path
// (path-less attributes read the walker's current tile, not listed here), and the boolean result.
// `readTiles` lets the UI highlight each tile the guard peeked at. `reason` distinguishes a false from
// an unresolved named predicate from a real comparison that came out false.
export type GuardEval = {
  text: string
  readTiles: ReadTile[]
  result: boolean
  reason?: 'boundary' | 'named-unresolved'
}

// Why a candidate destination did not survive (the engine stops at the first blocker — same order).
export type RejectReason =
  | { by: 'boundary' } // the edge ref hit a boundary / had no such edge
  | { by: 'own-guard'; guard: GuardEval } // the move rule's own guard was false (no directive overrode it)
  | { by: 'directive'; index: number; allow: boolean; guard: GuardEval } // an active directive blocked it
  | { by: 'max-split' } // the split cap was already reached

// One candidate chain of a move/morph: its text (`edge 0`, `straight -> r1`), the destination tile it
// resolved to (+ that tile's shape), and whether it survived (else why not).
export type CandidateTrace = {
  chainText: string
  dest: string | null
  destType: string | null
  heading: number | null
  survived: boolean
  reject?: RejectReason
}

// One statement's contribution, discriminated by what it did. `source` is the canonical statement
// text (the row label). A move/morph that was reached carries its candidates; a non-target guard that
// failed up front is a `gate-skip` (the action never ran); directives/writes/updates just record text.
export type StmtTrace =
  | { kind: 'reset'; source: string }
  | { kind: 'directive'; source: string; allow: boolean }
  | { kind: 'gate-skip'; source: string; guard: GuardEval }
  | { kind: 'move'; source: string; morphDef?: string; candidates: CandidateTrace[] }
  | { kind: 'write'; source: string }
  | { kind: 'update'; source: string }
  // A grouped `if <pred> { … } [else { … }]`: its guard verdict, whether the `if` ran, the nested `body`
  // traces (present only when it ran), and `elseBody` traces (present only when there's an else and it ran).
  | { kind: 'if-block'; source: string; guard: GuardEval; result: boolean; body: StmtTrace[]; elseBody?: StmtTrace[] }
  // A `find-tile` search: the tile it located this tick (null = nothing found).
  | { kind: 'find-tile'; source: string; foundTile: string | null }

// One walker's whole tick: its identity + start state, every statement it evaluated, and the raw
// branches it produced (PRE-coalesce — its own decision; cross-walker coalescing/age-drops are tick
// level). `missingDef` marks a walker whose definition was unknown (dropped, no statements).
export type TraverserTrace = {
  id: string
  def: string
  tile: string
  tileType: string
  heading: number // edge number (0 = top, clockwise) — the edge `straight` exits
  movement: Movement
  steps: number
  splits: number
  p: number
  q: number
  r: number
  missingDef?: boolean
  statements: StmtTrace[]
  branches: Array<{ tile: string; heading: number; morphDef?: string }>
}

// Two identical branches that merged this tick (same def|tile|heading|P|Q|R — the anti-blowup rule).
export type CoalesceTrace = { key: string; survivorId: string; mergedId: string }
// A branch dropped for exceeding its max-steps.
export type DropTrace = { id: string; steps: number; maxSteps: number }

// The whole tick. `step` is the tick computed FROM; `nextStep` is what the produced visits are
// stamped with. `destinations` are the unique tiles visited this tick.
export type TickTrace = {
  step: number
  nextStep: number
  traversers: TraverserTrace[]
  coalesced: CoalesceTrace[]
  dropped: DropTrace[]
  destinations: string[]
}
