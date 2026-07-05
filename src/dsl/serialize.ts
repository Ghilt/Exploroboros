// AST -> canonical text. Parens are inserted only where precedence needs them, and explicit
// Group/PredGroup wrappers are treated as transparent — so the output is the minimal, stable form
// that round-trips through parse (modulo dropped redundant groups). This canonical text is also the
// auto-name shown for a "simple" custom predicate.
//
// Precedence (must match parse.ts): or 1 < and 2 < not 3 < compare 4 ; for expressions
// + - 5 < * / % 6 < unary 7 < atom 8.

import type { Expr, Pred, AttrRef, PathSeg, TilePath } from './types'

function segStr(seg: PathSeg): string {
  switch (seg.kind) {
    case 'straight':
      return 'straight'
    case 'unvisited':
      return 'nearest-unvisited'
    case 'turn':
      return `${seg.dir}${seg.n}`
    case 'edge':
      return `e${seg.index}`
    case 'target':
      return 'target'
    case 'tile':
      return `tile ${seg.index}`
  }
}

// An attribute's edge-hop path back to text: `@e1`, `@r1@e5`, `@target`. Empty/absent → ''. Exported
// so the traverse trace + the visual editor can label a path without re-implementing this.
export function serializePath(path: TilePath | undefined): string {
  return path && path.length ? path.map((s) => `@${segStr(s)}`).join('') : ''
}
const pathStr = serializePath

function attrStr(a: AttrRef): string {
  let s: string = a.name
  if (a.index !== undefined) s += `[${a.index}]`
  s += pathStr(a.path)
  // scope 'tile' is the implicit default — omit it to keep the canonical/auto-name short.
  if (a.fallback !== undefined) s += ` default ${String(a.fallback)}`
  return s
}

type Texted = { s: string; prec: number }

function exprText(e: Expr): Texted {
  switch (e.kind) {
    case 'group':
      return exprText(e.inner) // transparent; precedence re-adds parens if needed
    case 'number':
      return { s: String(e.value), prec: 8 }
    case 'attr':
      return { s: attrStr(e), prec: 8 }
    case 'reg':
      return { s: `[${e.regs.map((r) => r.toUpperCase()).join(', ')}${pathStr(e.path)}]`, prec: 8 }
    case 'neg':
      return { s: `-${wrapExpr(e.operand, 7)}`, prec: 7 }
    case 'bin': {
      const prec = e.op === '+' || e.op === '-' ? 5 : 6
      return { s: `${wrapExpr(e.left, prec)} ${e.op} ${wrapExprRight(e.right, prec)}`, prec }
    }
  }
}

// Left operand / unary operand: parenthesize when it binds looser than the parent.
function wrapExpr(e: Expr, parentPrec: number): string {
  const { s, prec } = exprText(e)
  return prec < parentPrec ? `(${s})` : s
}
// Right operand: also parenthesize at equal precedence, so a right-leaning tree round-trips exactly
// (matters for the non-associative -, /, %).
function wrapExprRight(e: Expr, parentPrec: number): string {
  const { s, prec } = exprText(e)
  return prec <= parentPrec ? `(${s})` : s
}

function predText(p: Pred): Texted {
  switch (p.kind) {
    case 'predref':
      // Names can't contain spaces or other non-identifier chars (enforced when authoring + sanitized
      // on import), so a reference always re-lexes as one identifier — emit it bare.
      return { s: p.name, prec: 4 }
    case 'pgroup':
      return predText(p.inner)
    case 'compare':
      // Expression operands always bind tighter than a comparison, so never need wrapping.
      return { s: `${exprText(p.left).s} ${p.op} ${exprText(p.right).s}`, prec: 4 }
    case 'shape':
      return { s: `tile-type${pathStr(p.path)} ${p.op} ${p.shape}`, prec: 4 }
    case 'not':
      return { s: `not ${wrapPred(p.operand, 3)}`, prec: 3 }
    case 'bool': {
      const prec = p.op === 'or' ? 1 : 2
      return { s: `${wrapPred(p.left, prec)} ${p.op} ${wrapPredRight(p.right, prec)}`, prec }
    }
  }
}

function wrapPred(p: Pred, parentPrec: number): string {
  const { s, prec } = predText(p)
  return prec < parentPrec ? `(${s})` : s
}
function wrapPredRight(p: Pred, parentPrec: number): string {
  const { s, prec } = predText(p)
  return prec <= parentPrec ? `(${s})` : s
}

export function serialize(node: Pred): string {
  return predText(node).s
}

// Canonical text of a numeric expression — used by the traverser DSL to serialize `put`/`increase`
// values. Same precedence rules as predicates so it round-trips through parseExpr.
export function serializeExpr(node: Expr): string {
  return exprText(node).s
}
