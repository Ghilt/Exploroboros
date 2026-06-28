// AST for the traverser-program DSL — pure & isomorphic (no React/DOM/Konva), like src/dsl and
// src/tiling. A traverser DEFINITION is a header of settings + an ordered list of rules/directives,
// evaluated top-to-bottom each tick. Numeric formulas and boolean guards reuse src/dsl's `Expr`/`Pred`
// (parsed by delegating their substrings to src/dsl); this layer adds the statement grammar, the edge
// shorthands, and the `@ edge` decoration that points an inner predicate/expression at a neighbour.

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

// Points a decorated predicate/expression at another tile: a neighbour across an edge, or a tile by
// its number. A missing target (boundary / out of range) makes the predicate false / the value 0.
export type Decoration = { kind: 'edge'; edge: EdgeRef } | { kind: 'tile'; index: number }

// A guard predicate: written inline, or a reference to a saved predicate by name (resolved to inline
// at compile). Either may carry a decoration.
export type GuardPred = { kind: 'inline'; pred: Pred } | { kind: 'named'; name: string }
export type Guard = { pred: GuardPred; at?: Decoration }

// A numeric value with an optional decoration (read the inner expression on another tile).
export type DExpr = { expr: Expr; at?: Decoration }

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
// A directive gates ALL following move/morph actions: a move to a target is allowed only if it passes
// every active `allow` and no active `forbid` (forbid wins). `reset` clears the active directives.
export type Directive = { kind: 'directive'; allow: boolean; guard: Guard }
export type Reset = { kind: 'reset' }
export type Stmt = Rule | Directive | Reset

export type Settings = {
  maxSplit: number
  heading?: number // default heading in degrees; overridable when placed
  movement: Movement
  maxSteps: number
}

export type Program = {
  settings: Settings
  statements: ReadonlyArray<Stmt>
}

export const DEFAULT_SETTINGS: Settings = {
  maxSplit: 1,
  movement: 'relative',
  maxSteps: 50000,
}
