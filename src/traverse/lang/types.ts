// AST for the traverser-program DSL — pure & isomorphic (no React/DOM/Konva), like src/dsl and
// src/tiling. A traverser DEFINITION is a header of settings + an ordered list of rules/directives,
// evaluated top-to-bottom each tick. Numeric formulas and boolean guards reuse src/dsl's `Expr`/`Pred`
// (parsed by delegating their substrings to src/dsl); this layer adds the statement grammar and the edge
// shorthands. A predicate/expression reads a NEIGHBOUR tile via an attribute's own `@`-path (src/dsl) —
// `visited@e1`, `visited@target` — not a guard-level decoration.

import type { Expr, Pred } from '../../dsl'

export type Movement = 'relative' | 'absolute'

// One adjacent edge, resolved per-tile at exec time (see edges.ts):
//  - straight: continue the heading (least turn)
//  - turn r{n}/l{n}: the n-th edge turning right (clockwise) / left from straight
//  - edge {index}: the absolute clockwise-from-top edge number
//  - nearest-unvisited: the least-turn UNVISITED neighbour (the built-in walker move)
export type EdgeRef =
  | { kind: 'straight' }
  | { kind: 'turn'; dir: 'r' | 'l'; n: number }
  | { kind: 'edge'; index: number }
  | { kind: 'unvisited' }

// A chain hops several edges in ONE tick (re-aiming along each); only the final tile is visited.
export type Chain = ReadonlyArray<EdgeRef> // length >= 1
// A move target: one chain, or a set of chains that split (capped by max-split).
export type EdgeTarget = ReadonlyArray<Chain> // length 1 = single move; >1 = split

// A guard predicate: written inline, or a reference to a saved predicate by name (resolved to inline at
// compile). Which tile each attribute reads is carried by the attribute's own `@`-path (src/dsl), not a
// guard-level decoration. A path that hits a boundary / missing tile makes that attribute default / the
// shape test false.
export type GuardPred = { kind: 'inline'; pred: Pred } | { kind: 'named'; name: string }
export type Guard = { pred: GuardPred }

// A numeric value in a put/increase. Attributes inside carry their own `@`-path if they read another tile.
export type DExpr = { expr: Expr }

// Tile registries A/B/C (shared with drag-paint) and the traverser's own P/Q/R.
export type Reg = 'A' | 'B' | 'C' | 'P' | 'Q' | 'R'

export type SettingName = 'max-split' | 'heading' | 'movement' | 'max-steps'

export type Action =
  | { kind: 'move'; target: EdgeTarget }
  | { kind: 'morph'; def: string; target: EdgeTarget }
  | { kind: 'put'; reg: Reg; value: DExpr }
  | { kind: 'increase'; reg: Reg; by: DExpr }
  | { kind: 'update'; setting: SettingName; value: number | Movement }

export type Rule = { kind: 'rule'; guard?: Guard; action: Action }
// A directive gates ALL following move/morph actions: a candidate destination is allowed only if it
// passes every active `allow` and no active `forbid` (forbid wins). Like any guard the predicate reads
// the CURRENT tile by default; use `@target` on an attribute (e.g. `visited@target`) to test the
// destination instead. `reset` clears the active directives. Grammar: `directive if <guard> always
// forbid|allow move`.
export type Directive = { kind: 'directive'; allow: boolean; guard: Guard }
export type Reset = { kind: 'reset' }
export type Stmt = Rule | Directive | Reset

// Auto-place: seed walkers by a geometric RULE, resolved against whatever tiling renders (the small
// preview grid OR the big export grid) — so a pattern like "the top row, aiming north" scales with the
// grid, unlike a hand-placed seed that keeps its absolute offset from the centre. A `line` picks the
// tiles that a line at `angle` degrees (0 = row/horizontal, 90 = column/vertical) and `percent` across
// the plane (0 = top/left, 100 = bottom/right, measured from the top-left) passes through; each gets a
// walker aiming at absolute edge `edge` (mod the tile's side count). The optional guard is the ordinary
// tile predicate. Resolved at SEED time — no walker exists yet, so walker-relative `@`-paths fall back
// to defaults (see src/traverse/autoplace.ts). Kept OUT of `statements` so the tick (exec.ts) never runs it.
export type AutoPlaceLine = { angle: number; percent: number; edge: number }
export type AutoPlaceRule = { shape: 'line'; spec: AutoPlaceLine; guard?: Guard }

export type Settings = {
  maxSplit: number
  heading?: number // default heading as an edge NUMBER (0 = top, clockwise); overridable when placed
  movement: Movement
  maxSteps: number
}

export type Program = {
  settings: Settings
  statements: ReadonlyArray<Stmt>
  // Seed-placement rules (the `auto-place` lines) — resolved separately at seed time, never ticked.
  placements: ReadonlyArray<AutoPlaceRule>
}

export const DEFAULT_SETTINGS: Settings = {
  maxSplit: 1,
  movement: 'relative',
  maxSteps: 50000,
}
