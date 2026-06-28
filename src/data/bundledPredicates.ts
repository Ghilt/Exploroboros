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
  { id: 'unvisited', name: 'Unvisited', text: 'visited == 0', description: 'Tiles never visited.' },
  {
    id: 'rule90',
    name: 'Rule-90 gate',
    text: 'visited-neighbors == 1',
    description: 'Exactly one neighbouring tile is visited — the gate that grows Sierpinski-like patterns.',
  },
  {
    id: 'odd-visits',
    name: 'Odd visit count',
    text: 'visited % 2 == 1',
    description: 'Tiles visited an odd number of times.',
  },
  {
    id: 'checker',
    name: 'Checkerboard',
    text: '(coordinate[0] default 0 + coordinate[1] default 0) % 2 == 0',
    description: 'Every other tile, by lattice coordinates.',
  },
  { id: 'has-a', name: 'Has A', text: '[A] > 0', description: 'Tiles whose registry A is non-zero.' },
  { id: 'has-b', name: 'Has B', text: '[B] > 0', description: 'Tiles whose registry B is non-zero.' },
  { id: 'has-c', name: 'Has C', text: '[C] > 0', description: 'Tiles whose registry C is non-zero.' },
  {
    id: 'triangles',
    name: 'Triangles',
    text: 'tile-type == triangle',
    description: 'Triangle tiles — only matches on tilings that have triangles.',
  },
  {
    id: 'squares',
    name: 'Squares',
    text: 'tile-type == square',
    description: 'Square tiles — only matches on tilings that have squares.',
  },
]

export function getBundledPredicate(id: string): BundledPredicate | undefined {
  return BUNDLED_PREDICATES.find((p) => p.id === id)
}
