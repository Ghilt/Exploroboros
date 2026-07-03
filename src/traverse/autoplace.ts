// Resolve `auto-place` rules into seed walkers. Pure & isomorphic (no React/DOM/Konva) like the rest of
// src/traverse, so it runs in the live preview, the export worker, and Vitest identically. The whole point
// is that a rule is resolved against WHATEVER tiling is passed — the small exploration grid for preview, the
// big grid for export — so "the top row, aiming north" scales with the grid instead of stranding a
// centre-offset seed mid-plane (the hand-placed `seeds` keep the old absolute-offset behaviour; these are
// the grid-relative alternative). Resolution runs at SEED time, before any walk, so there is no walker: an
// auto-place guard reads the CURRENT tile's attributes (tile-type / orientation / coordinate / hand-painted
// visited); walker-relative `@`-paths have nothing to resolve and fall back to their defaults.

import type { Tiling, TileNode, Vec2 } from '../tiling'
import type { TileState } from '../canvas'
import { evalPredicate, type EvalContext } from '../dsl'
import type { AutoPlaceRule, Program } from './lang'
import type { Traverser } from './types'

// The tiles a line at `angleDeg` (0 = row/horizontal, 90 = column/vertical) and `percent` across the plane
// passes through. `percent` is measured perpendicular to the line from the TOP-LEFT extreme: 0 = the top
// (for a row) / left (for a column) edge, 100 = the opposite. A tile is "on the line" when its vertices
// straddle it (the infinite line passes through the polygon), so a horizontal line picks exactly the row at
// that height and a diagonal picks the staircase it crosses — correct on convex, concave and chiral tiles.
export function lineTiles(tiling: Tiling, angleDeg: number, percent: number): TileNode[] {
  const rad = (angleDeg * Math.PI) / 180
  // Normal to the line = the line direction rotated +90°. For 0° (horizontal) n = (0, 1) → offset in world
  // y (0% = max y = top); for 90° (vertical) n = (-1, 0) → offset in -x (0% = min x = left). y-up world.
  // Snap a hair-off component to 0 (cos(90°) is 6e-17, not 0) so an axis-aligned line stays axis-aligned —
  // otherwise the tiny tilt makes only the extreme-corner tile straddle the 0%/100% line.
  const snap = (x: number) => (Math.abs(x) < 1e-9 ? 0 : x)
  const n: Vec2 = { x: snap(-Math.sin(rad)), y: snap(Math.cos(rad)) }
  const b = tiling.bounds
  const corners: Vec2[] = [
    { x: b.minX, y: b.minY },
    { x: b.minX, y: b.maxY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
  ]
  let cmin = Infinity
  let cmax = -Infinity
  for (const p of corners) {
    const d = p.x * n.x + p.y * n.y
    if (d < cmin) cmin = d
    if (d > cmax) cmax = d
  }
  // percent 0 → cmax (the top-left extreme), 100 → cmin (the bottom-right).
  const c = cmax - (Math.max(0, Math.min(100, percent)) / 100) * (cmax - cmin)
  const out: TileNode[] = []
  for (const node of tiling.nodes) {
    let lo = Infinity
    let hi = -Infinity
    for (const v of node.vertices) {
      const d = v.x * n.x + v.y * n.y - c
      if (d < lo) lo = d
      if (d > hi) hi = d
    }
    if (lo <= 0 && hi >= 0) out.push(node)
  }
  return out
}

// Does an auto-place guard pass for a tile? No guard → yes. After compile every guard is inline (named
// references resolved), so a lingering 'named' guard means the compile map lacked it — treat as no match.
function guardPasses(rule: AutoPlaceRule, ctx: EvalContext): boolean {
  const g = rule.guard
  if (!g) return true
  return g.pred.kind === 'inline' ? evalPredicate(g.pred.pred, ctx) : false
}

// Resolve every compiled def's `auto-place` rules against `tiling` into seed walkers. One walker per tile
// (an earlier def / earlier rule that MATCHES wins), aimed at the rule's absolute `edge` modulo the tile's
// side count. `overlay` is the hand-paint base (so a `visited`-based guard reads the same board the export
// does); `indexById` backs `tile-number`.
export function resolveAutoPlacements(
  defs: ReadonlyMap<string, Program>,
  tiling: Tiling,
  overlay: ReadonlyMap<string, TileState>,
  indexById: ReadonlyMap<string, number>,
): Traverser[] {
  const out: Traverser[] = []
  const seen = new Set<string>()
  for (const [name, prog] of defs) {
    if (prog.placements.length === 0) continue
    for (const rule of prog.placements) {
      for (const node of lineTiles(tiling, rule.spec.angle, rule.spec.percent)) {
        if (seen.has(node.id)) continue
        const ctx: EvalContext = { node, tiling, overlay, indexById }
        if (!guardPasses(rule, ctx)) continue
        seen.add(node.id)
        const sides = node.sides.length
        const heading = sides > 0 ? (((Math.round(rule.spec.edge) % sides) + sides) % sides) : 0
        out.push({
          id: `ap:${name}:${node.id}`,
          tile: node.id,
          heading,
          def: name,
          steps: 0,
          splits: 0,
          maxSplit: prog.settings.maxSplit,
          maxSteps: prog.settings.maxSteps,
          movement: prog.settings.movement,
          p: 0,
          q: 0,
          r: 0,
        })
      }
    }
  }
  return out
}

// Merge two seed lists, one walker per tile — `primary` wins over `secondary` on a shared tile (hand-placed
// seeds win over auto-placed ones). Order is stable (all of `primary`, then `secondary`'s non-conflicting).
export function mergeByTile(
  primary: ReadonlyArray<Traverser>,
  secondary: ReadonlyArray<Traverser>,
): Traverser[] {
  const taken = new Set(primary.map((t) => t.tile))
  return [...primary, ...secondary.filter((t) => !taken.has(t.tile))]
}
