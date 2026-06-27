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
export type AttrName =
  | 'visited'
  | 'adjacent-visited'
  | 'adjacent-visited-unique'
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

// Where an attribute is read from. Only the current tile today; `neighbor`/`traverser` may join later
// (the owner's canonical example is `<attribute> of tile == 4`), so the scope lives on the node now.
export type AttrScope = 'tile'

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
export type Expr = NumberLit | AttrRef | Neg | Bin | Group

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
