// Does a predicate / expression read the move DESTINATION anywhere? A leaf whose `.`-path includes a
// `target` segment reads the candidate destination (resolved per branch). The traverser DSL uses this
// to decide a move/directive guard is evaluated PER candidate move rather than once up front against the
// current tile. Pure — no traverse/walker import; it only walks the src/dsl AST.

import type { Expr, Pred, TilePath } from './types'

function pathHasTarget(path: TilePath | undefined): boolean {
  return !!path && path.some((s) => s.kind === 'target')
}

export function exprReadsTarget(expr: Expr): boolean {
  switch (expr.kind) {
    case 'number':
      return false
    case 'attr':
      return pathHasTarget(expr.path)
    case 'regterm':
      return pathHasTarget(expr.path)
    case 'list':
      return expr.elems.some(exprReadsTarget)
    case 'neg':
      return exprReadsTarget(expr.operand)
    case 'group':
      return exprReadsTarget(expr.inner)
    case 'bin':
      return exprReadsTarget(expr.left) || exprReadsTarget(expr.right)
  }
}

export function predReadsTarget(pred: Pred): boolean {
  switch (pred.kind) {
    case 'predref':
      return false // resolved to a target-free tree by resolvePredRefs before this ever runs
    case 'compare':
      return exprReadsTarget(pred.left) || exprReadsTarget(pred.right)
    case 'shape':
      return pathHasTarget(pred.path)
    case 'exists':
      return pathHasTarget(pred.path)
    case 'listcmp':
      return pred.elems.some(exprReadsTarget) || exprReadsTarget(pred.right)
    case 'shapecmp':
      return pred.paths.some(pathHasTarget)
    case 'tilecmp':
      return pathHasTarget(pred.left) || pathHasTarget(pred.right)
    case 'not':
      return predReadsTarget(pred.operand)
    case 'bool':
      return predReadsTarget(pred.left) || predReadsTarget(pred.right)
    case 'pgroup':
      return predReadsTarget(pred.inner)
  }
}

// Collect the `found` (`.fN`) indices a predicate / expression reads, so the traverser compiler can
// reject a reference to a find-tile that doesn't exist (`move f2` with only two `find-tile` blocks).
// Same shallow AST walk as predReadsTarget; a `found` seg can only ever be a path's first hop.
function pathFoundIndices(path: TilePath | undefined, out: number[]): void {
  if (path) for (const s of path) if (s.kind === 'found') out.push(s.index)
}
export function exprFoundIndices(expr: Expr, out: number[] = []): number[] {
  switch (expr.kind) {
    case 'number':
      break
    case 'attr':
    case 'regterm':
      pathFoundIndices(expr.path, out)
      break
    case 'list':
      expr.elems.forEach((e) => exprFoundIndices(e, out))
      break
    case 'neg':
      exprFoundIndices(expr.operand, out)
      break
    case 'group':
      exprFoundIndices(expr.inner, out)
      break
    case 'bin':
      exprFoundIndices(expr.left, out)
      exprFoundIndices(expr.right, out)
      break
  }
  return out
}
export function predFoundIndices(pred: Pred, out: number[] = []): number[] {
  switch (pred.kind) {
    case 'predref':
      break
    case 'compare':
      exprFoundIndices(pred.left, out)
      exprFoundIndices(pred.right, out)
      break
    case 'shape':
      pathFoundIndices(pred.path, out)
      break
    case 'exists':
      pathFoundIndices(pred.path, out)
      break
    case 'listcmp':
      pred.elems.forEach((e) => exprFoundIndices(e, out))
      exprFoundIndices(pred.right, out)
      break
    case 'shapecmp':
      pred.paths.forEach((p) => pathFoundIndices(p, out))
      break
    case 'tilecmp':
      pathFoundIndices(pred.left, out)
      pathFoundIndices(pred.right, out)
      break
    case 'not':
      predFoundIndices(pred.operand, out)
      break
    case 'bool':
      predFoundIndices(pred.left, out)
      predFoundIndices(pred.right, out)
      break
    case 'pgroup':
      predFoundIndices(pred.inner, out)
      break
  }
  return out
}

// ---- walker-free (absolute) predicate analysis, for find-lowest/highest-tile (src/traverse/lang) ----
// find-lowest/highest scans EVERY tile with no walker, so its condition must be a pure function of the
// tile + overlay: tile attributes and ABSOLUTE `.`-paths only (edge chains `.e0.e1`, or a terminal
// `.tile N`). Anything needing a walker — a traverser-scope attribute (steps/splits/heading/P/Q/R) or a
// relative/target/found path segment — is rejected at compile so the answer stays cacheable + shareable.

function pathIsAbsolute(path: TilePath | undefined): boolean {
  return !path || path.every((s) => s.kind === 'edge' || s.kind === 'tile')
}

function exprIsAbsolute(expr: Expr): boolean {
  switch (expr.kind) {
    case 'number':
      return true
    case 'attr':
      return expr.scope !== 'traverser' && pathIsAbsolute(expr.path)
    case 'regterm':
      return pathIsAbsolute(expr.path)
    case 'list':
      return expr.elems.every(exprIsAbsolute)
    case 'neg':
      return exprIsAbsolute(expr.operand)
    case 'group':
      return exprIsAbsolute(expr.inner)
    case 'bin':
      return exprIsAbsolute(expr.left) && exprIsAbsolute(expr.right)
  }
}

// Is a predicate a pure function of (tile, overlay)? `predref` should be inlined before this runs; treat
// it as non-absolute defensively.
export function predIsAbsolute(pred: Pred): boolean {
  switch (pred.kind) {
    case 'predref':
      return false
    case 'compare':
      return exprIsAbsolute(pred.left) && exprIsAbsolute(pred.right)
    case 'shape':
      return pathIsAbsolute(pred.path)
    case 'exists':
      return pathIsAbsolute(pred.path)
    case 'listcmp':
      return pred.elems.every(exprIsAbsolute) && exprIsAbsolute(pred.right)
    case 'shapecmp':
      return pred.paths.every(pathIsAbsolute)
    case 'tilecmp':
      return pathIsAbsolute(pred.left) && pathIsAbsolute(pred.right)
    case 'not':
      return predIsAbsolute(pred.operand)
    case 'bool':
      return predIsAbsolute(pred.left) && predIsAbsolute(pred.right)
    case 'pgroup':
      return predIsAbsolute(pred.inner)
  }
}

// How far a (walker-free, absolute) predicate reads — drives the find-lowest cache's incremental
// maintenance. 'self' reads only the tile; 'neighbor' reads at most one absolute edge hop away; 'global'
// reads a multi-hop chain or a fixed `.tile N` (a write anywhere can flip the answer, so that query must
// rescan). Assumes an absolute predicate; any non-edge seg is treated as 'global' to stay safe.
export type PathReach = 'self' | 'neighbor' | 'global'
const REACH_RANK: Record<PathReach, number> = { self: 0, neighbor: 1, global: 2 }
function maxReach(a: PathReach, b: PathReach): PathReach {
  return REACH_RANK[a] >= REACH_RANK[b] ? a : b
}
function pathReach(path: TilePath | undefined): PathReach {
  if (!path || path.length === 0) return 'self'
  let hops = 0
  for (const s of path) {
    if (s.kind === 'edge') hops += 1
    else return 'global' // a fixed `tile N`, or any relative/target/found seg -> a distant write can flip it
  }
  return hops <= 1 ? 'neighbor' : 'global'
}
function exprReach(expr: Expr): PathReach {
  switch (expr.kind) {
    case 'number':
      return 'self'
    case 'attr':
    case 'regterm':
      return pathReach(expr.path)
    case 'list':
      return expr.elems.reduce<PathReach>((r, e) => maxReach(r, exprReach(e)), 'self')
    case 'neg':
      return exprReach(expr.operand)
    case 'group':
      return exprReach(expr.inner)
    case 'bin':
      return maxReach(exprReach(expr.left), exprReach(expr.right))
  }
}
export function predPathReach(pred: Pred): PathReach {
  switch (pred.kind) {
    case 'predref':
      return 'global'
    case 'compare':
      return maxReach(exprReach(pred.left), exprReach(pred.right))
    case 'shape':
      return pathReach(pred.path)
    case 'exists':
      return pathReach(pred.path)
    case 'listcmp':
      return pred.elems.reduce<PathReach>((r, e) => maxReach(r, exprReach(e)), exprReach(pred.right))
    case 'shapecmp':
      return pred.paths.reduce<PathReach>((r, p) => maxReach(r, pathReach(p)), 'self')
    case 'tilecmp':
      return maxReach(pathReach(pred.left), pathReach(pred.right))
    case 'not':
      return predPathReach(pred.operand)
    case 'bool':
      return maxReach(predPathReach(pred.left), predPathReach(pred.right))
    case 'pgroup':
      return predPathReach(pred.inner)
  }
}
