// AST for the tile-predicate DSL. Pure & isomorphic (no React/DOM/Konva), like src/tiling and
// src/canvas, so it runs under Vitest/SSR and can be shared by the future traverser DSL.
//
// Two layers: numeric `Expr` (attribute references + arithmetic) and boolean `Pred` (comparisons +
// boolean logic). A comparison turns expressions into a boolean; boolean operators combine those.
// The text form (parse/serialize) and the future visual editor both work over this one AST.

export type ArithOp = '+' | '-' | '*' | '/' | '%'
export type CompareOp = '==' | '!=' | '<' | '<=' | '>' | '>='
export type BoolOp = 'and' | 'or'

// The attributes the DSL exposes. The registry in attributes.ts maps each to how it is computed for
// a tile; the parser validates names against it. `coordinate` and `step` are indexed (`coordinate[0]`,
// `step[3]`); `coordinate`, `step`, `first-step`, `latest-step` may not exist for a tile and so
// require a `default`.
//
// The last group is the TRAVERSER attributes — a walker's own state, read inside the traverser DSL's
// formulas/guards (`steps`, `splits`, `heading` in degrees, and its registries `P`/`Q`/`R`). They
// only have a value when a traverser is in the EvalContext; in a tile-only context (coloring) they
// compute to 0, and the UI filters them out of the coloring/predicate menus (scope: 'traverser').
export type AttrName =
  | 'visited'
  | 'visited-neighbors'
  | 'visited-edges'
  | 'adjacent-visited' // alias of visited-edges (older name)
  | 'adjacent-visited-unique' // alias of visited-neighbors (older name)
  | 'registry-a'
  | 'registry-b'
  | 'registry-c'
  | 'edge-count'
  | 'tile-number'
  | 'rotation'
  | 'orientation' // tiling-agnostic 0-based index of a tile's rotational variant within its shape
  | 'coordinate'
  | 'first-step'
  | 'latest-step'
  | 'step'
  | 'steps'
  | 'splits'
  | 'heading'
  | 'P'
  | 'Q'
  | 'R'

// Where an attribute is read from. Tile attributes read the tile under evaluation; `traverser`
// attributes read the walker in the EvalContext (the traverser DSL). A tile attribute can also read a
// NEIGHBOUR tile by carrying an `@`-path (see TilePath) — the evaluator resolves the path to another
// tile and reads the attribute there; traverser attributes never take a path (they read the walker).
export type AttrScope = 'tile' | 'traverser'

// An attribute's edge-hop PATH: how to walk from the current tile to the tile the attribute is read
// from. `visited@e1` reads across edge 1; `visited@r1@e5` turns weak-right then crosses edge 5;
// `visited@target` reads the move's candidate destination. Empty/absent path = the current tile.
// Segments mirror the move EdgeRef vocabulary (edge/turn/straight/unvisited), plus two TERMINAL forms
// that name a tile directly and cannot be followed by more hops: `target` (the move destination,
// resolved per candidate) and `tile N` (the tile with absolute number N). The traverser layer resolves
// these against a walker (heading/movement/dest); in a walker-free context (coloring) a path resolves
// to nothing and the attribute falls back to its default.
// `found N` (`@fN`) names a tile a `find-tile` search located this tick — it's a BASE hop: it must come
// FIRST in a path (it establishes the starting tile + heading) and may be followed by chainable edge
// hops (`tile-type@f1`, `visited@f1@e0`), but never appear after another hop (`@e0@f1` is illegal). It
// only resolves in the traverser layer (which owns the per-tick found list); walker-free contexts
// (coloring) resolve it to nothing → default.
export type PathSeg =
  | { kind: 'straight' }
  | { kind: 'turn'; dir: 'r' | 'l'; n: number }
  | { kind: 'edge'; index: number }
  | { kind: 'unvisited' }
  | { kind: 'target' }
  | { kind: 'tile'; index: number }
  | { kind: 'found'; index: number }
export type TilePath = ReadonlyArray<PathSeg>

// ---- numeric expressions ----
export type NumberLit = { kind: 'number'; value: number }
export type AttrRef = {
  kind: 'attr'
  name: AttrName
  scope: AttrScope
  index?: number // coordinate[n] / step[n]
  fallback?: number // `default N` — used when the attribute has no value for the tile
  path?: TilePath // `@e1`, `@r1@e5`, `@target` — read the attribute on another tile (absent = current)
}
export type Neg = { kind: 'neg'; operand: Expr } // unary minus
export type Bin = { kind: 'bin'; op: ArithOp; left: Expr; right: Expr }
export type Group = { kind: 'group'; inner: Expr } // ( expr )
// Reduction modifiers on a list `[…]` used in an INPUT position (a condition, or a put value). Numeric
// reducers (sum/avg/min/max) reduce the list to ONE number; boolean reducers (all/any/none/xor) apply
// the comparison to EACH element then combine. Default (no `:modifier`) is `sum`.
export type Reducer = 'sum' | 'avg' | 'min' | 'max' | 'all' | 'any' | 'none' | 'xor'

// A tile registry A/B/C as a VALUE, with an optional `@`-path to read it on another tile. Usable bare
// (`A`, `A@e1`) OR as a list element (`[A]`, `[A, B]`, `[visited@e1, A@e3]`) — since `[…]` now clearly
// means "a list", a lone registry needn't be bracketed. `[A]` is just a one-element list of this term,
// so bare and bracketed forms round-trip to their own text. Case-insensitive on input; stored lowercase.
export type RegLetter = 'a' | 'b' | 'c'
export type RegTerm = { kind: 'regterm'; reg: RegLetter; path?: TilePath }
// A list of numeric value terms reduced to ONE number: `[A, B]` (sum is the default), `[a, b]:avg`
// (rounds up), `[…]:min` / `[…]:max`. An input-position value (a comparison operand or a put RHS). The
// boolean reducers don't make a number — a boolean-reduced list parses to a ListNumCompare/
// ListShapeCompare (below) instead, which folds the comparison in.
export type ListReduce = { kind: 'list'; reducer: 'sum' | 'avg' | 'min' | 'max'; elems: ReadonlyArray<Expr> }
export type Expr = NumberLit | AttrRef | Neg | Bin | Group | RegTerm | ListReduce

// ---- boolean predicates ----
export type Compare = { kind: 'compare'; op: CompareOp; left: Expr; right: Expr }
// A boolean-reduced numeric list: the comparison is applied to EACH element, then combined by the
// reducer — all = AND, any = OR, none = NOR, xor = exactly one. `[visited@e1, A@e3]:all == 1`.
export type ListNumCompare = { kind: 'listcmp'; reducer: 'all' | 'any' | 'none' | 'xor'; elems: ReadonlyArray<Expr>; op: CompareOp; right: Expr }
// The shape flavour: each element is a tile-type read (its `@`-path, or undefined = the current tile),
// compared to a shape name with == / !=. `[tile-type@r1, tile-type@r2]:xor == octagon`.
export type ListShapeCompare = { kind: 'shapecmp'; reducer: 'all' | 'any' | 'none' | 'xor'; paths: ReadonlyArray<TilePath | undefined>; op: '==' | '!='; shape: string }
// Tile type (shape class) is categorical, so it is its own leaf: `tile-type == wedge`. The shape name
// is a free identifier (not validated at parse time) so a predicate stays portable across tilings; on
// a tiling lacking that shape it simply matches nothing.
export type ShapeTest = { kind: 'shape'; op: '==' | '!='; shape: string; path?: TilePath }
export type Not = { kind: 'not'; operand: Pred }
export type BoolBin = { kind: 'bool'; op: BoolOp; left: Pred; right: Pred }
export type PredGroup = { kind: 'pgroup'; inner: Pred } // ( predicate )
// A reference to another predicate BY NAME (`isCrowded`, `Has_A`), composable with and/or/not like any
// other predicate (`isCrowded and Has_A`). Names can't contain spaces, so a bare identifier is always
// enough — no quoting. The parser has no registry, so it can't validate the name eagerly;
// resolvePredRefs inlines it (or errors on an unknown/cyclic name) before eval ever sees one.
export type PredRef = { kind: 'predref'; name: string }
// Does an `@`-path resolve to a real tile? `exists@f0` is true iff a find-tile search located a tile;
// `exists@e0` is true iff there's a neighbour across edge 0 (false at a boundary) — the general test
// behind any "off-grid" fallback, since a resolved tile's OWN attribute values (0, false, …) are
// otherwise indistinguishable from "this path didn't resolve at all". A path is required — the current
// tile always exists, so a bare `exists` would be trivially true and is rejected as a likely mistake.
export type Exists = { kind: 'exists'; path: TilePath }
export type Pred = Compare | ShapeTest | Not | BoolBin | PredGroup | PredRef | ListNumCompare | ListShapeCompare | Exists

// ---- parse results (errors never thrown across the module boundary) ----
export type Span = { start: number; end: number }
export type ParseError = { message: string; span: Span }
export type Result<T> = { ok: true; value: T } | { ok: false; error: ParseError }
