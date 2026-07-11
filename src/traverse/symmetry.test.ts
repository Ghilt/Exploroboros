// Engine-symmetry regression guard, distilled from the kagome-square asymmetry investigation.
//
// An absolute-edge FULL-FAN program (each tile moves to ALL its edges) must preserve the tiling's
// geometric symmetry: starting from a symmetric tile, the visited set stays invariant under the
// tiling's mirror/rotation about that start. This exercises edge numbering (clockwiseEdgeOrder),
// adjacency (across), the tick, coalescing, and visit-stamping together — the machinery behind the
// recurring edge-numbering bugs (CLAUDE.md §9). If any of it becomes chiral/mis-numbered, this breaks.
//
// IMPORTANT (the actual finding): only a FULL fan is symmetric. Absolute edge numbers are
// clockwise-from-north = HANDED, so a *selective* absolute route (e.g. a triangle's `eK.eK`) is
// intentionally chiral and NOT expected to be symmetric — the mirror of `e1.e1` is `e2.e5`, not `e2.e2`.
import { describe, it, expect } from 'vitest'
import { buildTiling } from '../canvas'
import type { TileState } from '../canvas'
import { compileProgram, stepTraversers, type Traverser, type Program } from './index'
import type { Tiling, TileNode } from '../tiling'

const FULLFAN = `max-split = 6
if tile-type == hexagon { move [e0..e5] }
if tile-type == triangle { move [e0..e2] }
if tile-type == square { move [e0..e3] }`

function nearestOfShape(tiling: Tiling, shape: string, x: number, y: number): TileNode | null {
  let best: TileNode | null = null
  let bd = Infinity
  for (const n of tiling.nodes) {
    if (n.shape !== shape) continue
    const d = (n.centroid.x - x) ** 2 + (n.centroid.y - y) ** 2
    if (d < bd) { bd = d; best = n }
  }
  return best
}
function nearestDist(tiling: Tiling, x: number, y: number): { node: TileNode; dist: number } {
  let best = tiling.nodes[0]
  let bd = Infinity
  for (const n of tiling.nodes) {
    const d = (n.centroid.x - x) ** 2 + (n.centroid.y - y) ** 2
    if (d < bd) { bd = d; best = n }
  }
  return { node: best, dist: Math.sqrt(bd) }
}

type Iso = (x: number, y: number) => [number, number]
const mirrorX = (cx: number, _cy: number): Iso => (x, y) => [2 * cx - x, y] // vertical-line mirror
const mirrorY = (_cx: number, cy: number): Iso => (x, y) => [x, 2 * cy - y] // horizontal-line mirror
const rot180 = (cx: number, cy: number): Iso => (x, y) => [2 * cx - x, 2 * cy - y]
const EPS = 0.02

function runVisited(tiling: Tiling, prog: Program, startId: string, ticks: number): Set<string> {
  const indexById = new Map(tiling.nodes.map((n, i) => [n.id, i]))
  const defs = new Map<string, Program>([['W', prog]])
  let overlay: Map<string, TileState> = new Map([[startId, { visits: [0], a: 0, b: 0, c: 0 }]])
  let travs: Traverser[] = [{ id: 's', tile: startId, heading: 0, def: 'W', steps: 0, splits: 0, maxSplit: prog.settings.maxSplit, maxSteps: prog.settings.maxSteps, movement: prog.settings.movement, p: 0, q: 0, r: 0 }]
  let step = 0
  for (let t = 0; t < ticks; t += 1) {
    const res = stepTraversers({ tiling, overlay, traversers: travs, step, defs, indexById })
    overlay = res.overlay as Map<string, TileState>
    travs = res.traversers
    step = res.step
  }
  return new Set([...overlay.keys()].filter((id) => overlay.get(id)!.visits.length > 0))
}

// Every visited tile within radius R of the start whose image lands on a real tile must also be visited.
function invariant(tiling: Tiling, visited: Set<string>, iso: Iso, cx: number, cy: number, R: number): boolean {
  const byId = new Map(tiling.nodes.map((n) => [n.id, n]))
  for (const id of visited) {
    const p = byId.get(id)!.centroid
    if (Math.hypot(p.x - cx, p.y - cy) > R) continue
    const [mx, my] = iso(p.x, p.y)
    const hit = nearestDist(tiling, mx, my)
    if (hit.dist > EPS) continue // image off the lattice (boundary) — not a violation
    if (!visited.has(hit.node.id)) return false
  }
  return true
}

describe('engine preserves tiling symmetry (kagome-square, full absolute fan)', () => {
  const c = compileProgram(FULLFAN, new Map())
  it('compiles the control program', () => expect(c.ok).toBe(true))
  if (!c.ok) return
  const prog = c.value
  const tiling = buildTiling('kagome-square', 30)
  const cen = { x: (tiling.bounds.minX + tiling.bounds.maxX) / 2, y: (tiling.bounds.minY + tiling.bounds.maxY) / 2 }
  const TICKS = 8
  const R = 6

  it('hexagon start: visited set is invariant under both mirrors and 180°', () => {
    const s = nearestOfShape(tiling, 'hexagon', cen.x, cen.y)!
    const vis = runVisited(tiling, prog, s.id, TICKS)
    expect(vis.size).toBeGreaterThan(20) // it actually grew
    expect(invariant(tiling, vis, mirrorX(s.centroid.x, s.centroid.y), s.centroid.x, s.centroid.y, R)).toBe(true)
    expect(invariant(tiling, vis, mirrorY(s.centroid.x, s.centroid.y), s.centroid.x, s.centroid.y, R)).toBe(true)
    expect(invariant(tiling, vis, rot180(s.centroid.x, s.centroid.y), s.centroid.x, s.centroid.y, R)).toBe(true)
  })

  it('square start: visited set is invariant under both mirrors and 180°', () => {
    const s = nearestOfShape(tiling, 'square', cen.x, cen.y)!
    const vis = runVisited(tiling, prog, s.id, TICKS)
    expect(invariant(tiling, vis, mirrorX(s.centroid.x, s.centroid.y), s.centroid.x, s.centroid.y, R)).toBe(true)
    expect(invariant(tiling, vis, mirrorY(s.centroid.x, s.centroid.y), s.centroid.x, s.centroid.y, R)).toBe(true)
    expect(invariant(tiling, vis, rot180(s.centroid.x, s.centroid.y), s.centroid.x, s.centroid.y, R)).toBe(true)
  })
})
