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

// A move chain may start from a base tile OTHER than the walker's current one:
//  - found N: a tile a `find-tile` search located this tick — `move f0`, or with a trailing chain
//    `move f1@e0`.
//  - find: an INLINE `find-tile <pred> { … }` run right here; its result is the base (and is stored as
//    this find-tile's `fN` for later reference too).
// No base = the walker's current tile (the common case). `fN` can only ever be a base, never a later hop
// (`move e0@f1` is rejected at parse time — an edge ref can't be `fN`).
export type ChainBase = { kind: 'found'; index: number } | { kind: 'find'; find: FindTile }
// A chain hops several edges in ONE tick (re-aiming along each) from its base tile; only the final tile
// is visited. `refs` may be empty when a base names the destination directly (`move f0`).
export type Chain = { base?: ChainBase; refs: ReadonlyArray<EdgeRef> }
// A move target: one chain, or a set of chains that split (capped by max-split).
export type EdgeTarget = ReadonlyArray<Chain> // length 1 = single move; >1 = split

// A guard predicate: written inline, or a reference to a saved predicate by name (resolved to inline at
// compile). Which tile each attribute reads is carried by the attribute's own `@`-path (src/dsl), not a
// guard-level decoration. A path that hits a boundary / missing tile makes that attribute default / the
// shape test false.
export type GuardPred = { kind: 'inline'; pred: Pred } | { kind: 'named'; name: string }
export type Guard = { pred: GuardPred }

// A `find-tile <pred> { <moves> }` search: a breadth-first "ghost walk" from the walker's tile. The body
// moves say how the frontier EXPANDS — they never move the real walker. `maxSplit` caps how many children
// each frontier tile spawns (exactly like a walker's own `max-split`, and likewise DEFAULT 1 — so by
// default the search follows a single path; raise it, e.g. with a `max-split = 4` line in the block, to
// fan out). The first tile AT LEAST ONE hop away whose `pred` holds is returned (nearest-first, BFS
// order) — exactly one tile, or none if the search exhausts. Every find-tile in a program gets a
// source-position `index`, exposed as `fN` (`move f0`, `tile-type@f1`, …). Body moves may be guarded but
// carry no base (each hops from the frontier tile it's expanding).
export type FindMove = { guard?: Guard; target: EdgeTarget }
export type FindTile = { index: number; pred: Guard; maxSplit: number; body: ReadonlyArray<FindMove> }

// A numeric value in a put/increase. Attributes inside carry their own `@`-path if they read another tile.
export type DExpr = { expr: Expr }

// Where a put/increase writes, mirroring how each registry is READ in a formula:
//  - tile-reg: a per-tile registry A/B/C, written in brackets `[A]`, with an optional `@`-path so a
//    walker can write a NEIGHBOUR's registry (`[B@e1]` = the tile across edge 1). Shared with drag-paint.
//    Several at once with `[A, B]` (each gets the same value).
//  - walker-reg: the traverser's own P/Q/R — bare, no path (walker state isn't per-tile).
// An off-grid path makes the write a no-op (see exec.ts), the same way an off-grid read defaults.
export type WriteTarget =
  | { kind: 'tile-reg'; reg: RegLetter; path?: TilePath }
  | { kind: 'walker-reg'; reg: 'P' | 'Q' | 'R' }

export type SettingName = 'max-split' | 'heading' | 'movement' | 'max-steps'

export type Action =
  | { kind: 'move'; target: EdgeTarget }
  | { kind: 'morph'; def: string; target: EdgeTarget }
  | { kind: 'put'; target: ReadonlyArray<WriteTarget>; value: DExpr }
  | { kind: 'increase'; target: ReadonlyArray<WriteTarget>; by: DExpr }
  | { kind: 'update'; setting: SettingName; value: number | Movement }

export type Rule = { kind: 'rule'; guard?: Guard; action: Action }
// A directive gates ALL following move/morph actions. Per candidate destination (order: forbid > allow >
// the move's own guard): a matching `forbid` blocks it; else a matching `allow` permits it, OVERRIDING
// the move's own guard; else the move's own guard decides; else it's allowed. So an `allow` with nothing
// to override is a no-op. Like any guard the predicate reads the CURRENT tile by default; use `@target`
// on an attribute (e.g. `visited@target`) to test the destination instead. `reset` clears the active
// directives. Grammar: `directive if <guard> always forbid|allow move`.
export type Directive = { kind: 'directive'; allow: boolean; guard: Guard }
export type Reset = { kind: 'reset' }
// A grouped conditional: run `body` when `guard` holds, else `elseBody` (if present). Any statement
// except header settings may live inside, and blocks nest. `else if` is just an `elseBody` holding a
// single nested if-block. (The single-line `if <guard> then <action>` stays a Rule.)
export type IfBlock = { kind: 'if-block'; guard: Guard; body: ReadonlyArray<Stmt>; elseBody?: ReadonlyArray<Stmt> }
// A standalone find-tile search that only records its result as `fN`; a later statement uses it (`move f0`).
export type FindStmt = { kind: 'find-tile'; find: FindTile }
export type Stmt = Rule | Directive | Reset | IfBlock | FindStmt

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
