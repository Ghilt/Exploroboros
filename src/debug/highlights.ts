// Pure mapping from a decision-trace node to the tiles to highlight on the canvas, grouped by role.
// No React/DOM/Konva — so it's unit-testable and the canvas just consumes the result. Hovering a log
// row calls one of these to light up the tiles that row is about (the current tile, the tile a
// decoration read, the candidate destinations, chosen vs rejected).

import type { CandidateTrace, GuardEval, StmtTrace, TraverserTrace, WriteTargetTrace } from '../traverse'
import type { HighlightGroups, HighlightRole } from '../components/TilingCanvas'

// Drop empties + de-dupe ids; preserves the given role order (current first → chosen last).
function build(parts: Array<{ role: HighlightRole; ids: Array<string | null | undefined> }>): HighlightGroups {
  const groups: Array<{ role: HighlightRole; ids: string[] }> = []
  for (const p of parts) {
    const ids = [...new Set(p.ids.filter((x): x is string => !!x))]
    if (ids.length) groups.push({ role: p.role, ids })
  }
  return groups
}

// Hovering a walker's summary: where it is now + where its surviving branches went.
export function walkerGroups(w: TraverserTrace): HighlightGroups {
  return build([
    { role: 'current', ids: [w.tile] },
    { role: 'chosen', ids: w.branches.map((b) => b.tile) },
  ])
}

// Hovering one statement row.
export function statementGroups(w: TraverserTrace, s: StmtTrace): HighlightGroups {
  if (s.kind === 'gate-skip') {
    // The motivating case: show the current tile + every tile the guard's @-paths read.
    return build([
      { role: 'current', ids: [w.tile] },
      { role: 'decorator', ids: s.guard.readTiles.map((r) => r.id) },
    ])
  }
  if (s.kind === 'move') {
    return build([
      { role: 'current', ids: [w.tile] },
      { role: 'decorator', ids: s.candidates.flatMap(decoratorTiles) },
      { role: 'chosen', ids: s.candidates.filter((c) => c.survived).map((c) => c.dest) },
      { role: 'rejected', ids: s.candidates.filter((c) => !c.survived).map((c) => c.dest) },
    ])
  }
  if (s.kind === 'if-block') {
    // The block's guard + every tile it read (the found/neighbour tiles that decided whether it ran).
    return build([
      { role: 'current', ids: [w.tile] },
      { role: 'decorator', ids: s.guard.readTiles.map((r) => r.id) },
    ])
  }
  if (s.kind === 'find-tile') {
    // Point at the tile the search located (if any) as the "chosen" tile.
    return build([
      { role: 'current', ids: [w.tile] },
      { role: 'chosen', ids: [s.foundTile] },
    ])
  }
  if (s.kind === 'write') {
    // Light up every tile this put/increase wrote to — so a multi-target list shows its whole spread,
    // and a target that resolved off-grid (a typo'd/stray `@`-path) simply doesn't light up.
    return build([
      { role: 'current', ids: [w.tile] },
      { role: 'write', ids: s.targets.map((t) => t.id) },
    ])
  }
  // directive / update / reset — nothing to point at but the current tile.
  return build([{ role: 'current', ids: [w.tile] }])
}

// Hovering ONE target of a write (`B@f1@e3@e3@e2`): pin the focus on just that tile so you can pick a
// single element out of a long `put […]` list. A walker register / off-grid target lights nothing.
export function writeTargetGroups(w: TraverserTrace, t: WriteTargetTrace): HighlightGroups {
  return build([
    { role: 'current', ids: [w.tile] },
    { role: 'chosen', ids: [t.id] },
  ])
}

// Hovering a single candidate row of a move.
export function candidateGroups(w: TraverserTrace, c: CandidateTrace): HighlightGroups {
  return build([
    { role: 'current', ids: [w.tile] },
    { role: 'decorator', ids: decoratorTiles(c) },
    { role: c.survived ? 'chosen' : 'rejected', ids: [c.dest] },
  ])
}

// The tiles a candidate's reject guard READ via `@`-paths, other than the candidate's own destination
// (a `@target` read IS the dest — already shown as chosen/rejected, so there's nothing extra to mark).
function decoratorTiles(c: CandidateTrace): Array<string | null> {
  const g = guardOf(c)
  if (!g) return []
  return g.readTiles.filter((r) => r.id && r.id !== c.dest).map((r) => r.id)
}
function guardOf(c: CandidateTrace): GuardEval | null {
  if (c.reject && (c.reject.by === 'own-guard' || c.reject.by === 'directive')) return c.reject.guard
  return null
}
