// Pure mapping from a decision-trace node to the tiles to highlight on the canvas, grouped by role.
// No React/DOM/Konva — so it's unit-testable and the canvas just consumes the result. Hovering a log
// row calls one of these to light up the tiles that row is about (the current tile, the tile a
// decoration read, the candidate destinations, chosen vs rejected).

import type { CandidateTrace, GuardEval, StmtTrace, TraverserTrace } from '../traverse'
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
    // The motivating case: show the current tile + the tile the (decorated) guard actually read.
    return build([
      { role: 'current', ids: [w.tile] },
      { role: 'decorator', ids: [s.guard.decorated ? s.guard.tileId : null] },
    ])
  }
  if (s.kind === 'move') {
    return build([
      { role: 'current', ids: [w.tile] },
      { role: 'decorator', ids: s.candidates.map(decoratorTile) },
      { role: 'chosen', ids: s.candidates.filter((c) => c.survived).map((c) => c.dest) },
      { role: 'rejected', ids: s.candidates.filter((c) => !c.survived).map((c) => c.dest) },
    ])
  }
  // directive / write / update / reset — nothing to point at but the current tile.
  return build([{ role: 'current', ids: [w.tile] }])
}

// Hovering a single candidate row of a move.
export function candidateGroups(w: TraverserTrace, c: CandidateTrace): HighlightGroups {
  return build([
    { role: 'current', ids: [w.tile] },
    { role: 'decorator', ids: [decoratorTile(c)] },
    { role: c.survived ? 'chosen' : 'rejected', ids: [c.dest] },
  ])
}

// The tile a candidate's reject guard READ via a decoration, when it differs from the candidate's own
// destination (the common `@ target` guard reads the dest itself, so there's nothing extra to mark).
function decoratorTile(c: CandidateTrace): string | null {
  const g = guardOf(c)
  if (!g || !g.decorated || !g.tileId) return null
  return g.tileId === c.dest ? null : g.tileId
}
function guardOf(c: CandidateTrace): GuardEval | null {
  if (c.reject && (c.reject.by === 'per-target' || c.reject.by === 'directive')) return c.reject.guard
  return null
}
