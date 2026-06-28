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
// attributes read the walker in the EvalContext (the traverser DSL). (`neighbor` reads are done by
// the traverser DSL's `@ edge` decoration — by pointing the context's tile at the neighbour — not a
// scope here.)
export type AttrScope = 'tile' | 'traverser'

// ---- numeric expressions ----
export type NumberLit = { kind: 'number'; value: number }
export type AttrRef = {
  kind: 'attr'
  name: AttrName
  scope: AttrScope
  index?: number // coordinate[n] / step[n]
  fallback?: number // `default N` — used when the attribute has no value for the tile
}
export type Neg = { kind: 'neg'; operand: Expr } // unary minus
export type Bin = { kind: 'bin'; op: ArithOp; left: Expr; right: Expr }
export type Group = { kind: 'group'; inner: Expr } // ( expr )
// A tile-registry read: `[A]` is registry A, `[A, B]` is the SUM of A and B. Case-insensitive on
// input; stored lowercase. The dedicated bracket syntax replaces the old `registry-a` attribute name.
export type RegLetter = 'a' | 'b' | 'c'
export type RegRead = { kind: 'reg'; regs: ReadonlyArray<RegLetter> }
export type Expr = NumberLit | AttrRef | Neg | Bin | Group | RegRead

// ---- boolean predicates ----
export type Compare = { kind: 'compare'; op: CompareOp; left: Expr; right: Expr }
// Tile type (shape class) is categorical, so it is its own leaf: `tile-type == wedge`. The shape name
// is a free identifier (not validated at parse time) so a predicate stays portable across tilings; on
// a tiling lacking that shape it simply matches nothing.
export type ShapeTest = { kind: 'shape'; op: '==' | '!='; shape: string }
export type Not = { kind: 'not'; operand: Pred }
export type BoolBin = { kind: 'bool'; op: BoolOp; left: Pred; right: Pred }
export type PredGroup = { kind: 'pgroup'; inner: Pred } // ( predicate )
export type Pred = Compare | ShapeTest | Not | BoolBin | PredGroup

// ---- parse results (errors never thrown across the module boundary) ----
export type Span = { start: number; end: number }
export type ParseError = { message: string; span: Span }
export type Result<T> = { ok: true; value: T } | { ok: false; error: ParseError }
