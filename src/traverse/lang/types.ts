// AST for the traverser-program DSL — pure & isomorphic (no React/DOM/Konva), like src/dsl and
// src/tiling. A traverser DEFINITION is a header of settings + an ordered list of rules/directives,
// evaluated top-to-bottom each tick. Numeric formulas and boolean guards reuse src/dsl's `Expr`/`Pred`
// (parsed by delegating their substrings to src/dsl); this layer adds the statement grammar and the edge
// shorthands. A predicate/expression reads a NEIGHBOUR tile via an attribute's own `@`-path (src/dsl) —
// `visited@e1`, `visited@target` — not a guard-level decoration.

import type { Expr, Pred, RegLetter, TilePath } from '../../dsl'

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

// Where a put/increase writes, mirroring how each registry is READ in a formula:
//  - tile-reg: a per-tile registry A/B/C, written in brackets `[A]`, with an optional `@`-path so a
//    walker can write a NEIGHBOUR's registry (`[B@e1]` = the tile across edge 1). Shared with drag-paint.
//  - walker-reg: the traverser's own P/Q/R — bare, no path (walker state isn't per-tile).
// An off-grid path makes the write a no-op (see exec.ts), the same way an off-grid read defaults.
export type WriteTarget =
  | { kind: 'tile-reg'; reg: RegLetter; path?: TilePath }
  | { kind: 'walker-reg'; reg: 'P' | 'Q' | 'R' }

export type SettingName = 'max-split' | 'heading' | 'movement' | 'max-steps'

export type Action =
  | { kind: 'move'; target: EdgeTarget }
  | { kind: 'morph'; def: string; target: EdgeTarget }
  | { kind: 'put'; target: WriteTarget; value: DExpr }
  | { kind: 'increase'; target: WriteTarget; by: DExpr }
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

export type Settings = {
  maxSplit: number
  heading?: number // default heading as an edge NUMBER (0 = top, clockwise); overridable when placed
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
