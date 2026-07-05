// Bundled predicates shipped for the user — non-editable starting points they can copy into an
// editable custom predicate. Mirrors the catalog shape of src/data/tilings.ts: an immutable typed
// array keyed by id, plus a finder. Each `text` is DSL the predicate pane parses on load.

export type BundledPredicate = {
  id: string
  name: string
  text: string
  description: string
}

export const BUNDLED_PREDICATES: ReadonlyArray<BundledPredicate> = [
  { id: 'visited', name: 'Visited', text: 'visited > 0', description: 'Tiles visited at least once.' },
  {
    id: 'visited-neighbor',
    name: 'Visited_neighbor',
    text: 'visited-neighbors > 0',
    description: 'Tiles with at least one visited neighbour.',
  },
  { id: 'unvisited', name: 'Unvisited', text: 'visited == 0', description: 'Tiles never visited.' },
  {
    id: 'unvisited-neighbor',
    name: 'Unvisited_neighbor',
    text: 'visited-neighbors == 0',
    description: 'Tiles with no visited neighbours.',
  },
  { id: 'has-a', name: 'Has_A', text: '[A] > 0', description: 'Tiles whose registry A is non-zero.' },
  { id: 'has-b', name: 'Has_B', text: '[B] > 0', description: 'Tiles whose registry B is non-zero.' },
  { id: 'has-c', name: 'Has_C', text: '[C] > 0', description: 'Tiles whose registry C is non-zero.' },
]

export function getBundledPredicate(id: string): BundledPredicate | undefined {
  return BUNDLED_PREDICATES.find((p) => p.id === id)
}
