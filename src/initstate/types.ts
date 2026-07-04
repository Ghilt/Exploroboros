// AST for the Initial-state DSL — pure & isomorphic (no React/DOM/Konva), like src/dsl and
// src/tiling. One document is a list of `auto-place` statements, each seeding part of a fractal's
// STARTING state — a traverser, a per-tile registry [A]/[B]/[C], or `visited` marks — by a
// grid-relative geometric rule. Resolution runs against WHATEVER tiling renders (the small preview
// grid OR the big export grid), so "the top row" or "a blob in the middle" scales with the grid
// instead of stranding an absolute-offset seed. The optional `if` guard reuses the tile-predicate DSL
// (src/dsl). Numbers are the raw signed literals; meaning depends on shape + what (see resolve.ts).

import type { Pred } from '../dsl'

// What an auto-place line places on each chosen tile.
//  - traverser: by number `t1`,`t2`,… (1-based, Traversers-pane list order) or by name.
//  - reg: one of the per-tile registries a/b/c (written as [A]/[B]/[C] in the DSL).
//  - visited: mark the tile visited.
export type What =
  | { kind: 'traverser'; ref: string }
  | { kind: 'reg'; reg: 'a' | 'b' | 'c' }
  | { kind: 'visited' }

// A guard predicate: written inline (parsed to a src/dsl Pred), or a named reference to a saved
// predicate resolved to inline at compile (mirrors the traverser DSL's guard). Same shape as the
// traverser lang's Guard, kept local so this module doesn't reach into that one's internals.
export type GuardPred = { kind: 'inline'; pred: Pred } | { kind: 'named'; name: string }
export type Guard = { pred: GuardPred }

// Geometry of the placement:
//  - line: a line at `angle`° (0 = row/horizontal, 90 = column/vertical, ±45 = diagonal), `percent`
//    0–100 perpendicular from the top-left. Picks the tiles the line passes through.
//  - blob: a point at `x`%,`y`% from the top-left (0,0 = top-left, 50,50 = centre, 100,100 =
//    bottom-right) grown out `radius` BFS tile-rings (1 = the single nearest tile, 2 = + its
//    neighbours, …).
export type LineShape = { kind: 'line'; angle: number; percent: number }
export type BlobShape = { kind: 'blob'; x: number; y: number; radius: number }
export type Shape = LineShape | BlobShape

// One statement. `param` is the trailing value that is SET on each chosen tile:
//  - traverser → the heading edge (mod the tile's side count);
//  - reg → the registry is set to `param`;
//  - visited → the tile is marked with max(1, param) visits (0 / omitted → mark once).
export type InitStmt = { shape: Shape; what: What; param: number; guard?: Guard }

// A whole Initial-state document.
export type Doc = ReadonlyArray<InitStmt>
