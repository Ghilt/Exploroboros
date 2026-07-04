// The tiling catalog — what the Canvas tiling-picker offers. This is display/roadmap data
// (names, vertex configs, build status), separate from the engine's actual generators in
// src/tiling/. Only `ready` tilings have a working generator; `preview` has a thumbnail but no
// generator yet; `planned` are placeholders for the rest of the target set.

export type TilingStatus = 'ready' | 'preview' | 'planned'

export type TilingEntry = {
  id: string
  name: string
  vertexConfig: string
  status: TilingStatus
}

// Ordered for display: the two with real thumbnails lead, then the remaining uniform tilings, then
// the "expanded list" extras. Base set = the 11 convex uniform Euclidean tilings + the prototype's
// octagon+wedge; plus two 2-uniform dodecagon tilings and the rhombille (a Laves dual) — the first
// picks from the expanded uniform-tiling list.
export const TILINGS: ReadonlyArray<TilingEntry> = [
  { id: 'square', name: 'Square', vertexConfig: '4.4.4.4', status: 'ready' },
  { id: 'kalleboda', name: 'Kalleboda', vertexConfig: 'octagon + wedge', status: 'ready' },
  { id: 'triangular', name: 'Triangular', vertexConfig: '3.3.3.3.3.3', status: 'ready' },
  { id: 'hexagonal', name: 'Hexagonal', vertexConfig: '6.6.6', status: 'ready' },
  { id: 'trihexagonal', name: 'Trihexagonal', vertexConfig: '3.6.3.6', status: 'ready' },
  { id: 'snub-square', name: 'Snub Square', vertexConfig: '3.3.4.3.4', status: 'ready' },
  { id: 'snub-hexagonal', name: 'Snub Hexagonal', vertexConfig: '3.3.3.3.6', status: 'ready' },
  { id: 'elongated-triangular', name: 'Elongated Triangular', vertexConfig: '3.3.3.4.4', status: 'ready' },
  { id: 'truncated-square', name: 'Truncated Square', vertexConfig: '4.8.8', status: 'ready' },
  { id: 'truncated-hexagonal', name: 'Truncated Hexagonal', vertexConfig: '3.12.12', status: 'ready' },
  { id: 'rhombitrihexagonal', name: 'Rhombitrihexagonal', vertexConfig: '3.4.6.4', status: 'ready' },
  { id: 'truncated-trihexagonal', name: 'Truncated Trihexagonal', vertexConfig: '4.6.12', status: 'ready' },
  { id: 'dodecagon-hex', name: 'Dodecagon & Hexagon', vertexConfig: '3.4.6.12', status: 'ready' },
  { id: 'dodecagon-square', name: 'Dodecagon & Square', vertexConfig: '3.4.3.12', status: 'ready' },
  { id: 'rhombille', name: 'Rhombille', vertexConfig: 'rhombi · dual 3.6.3.6', status: 'ready' },
  { id: 'kagome-square', name: 'Kagome & Squares', vertexConfig: '3.4.4.6 · 3.6.3.6', status: 'ready' },
]

export function getTiling(id: string): TilingEntry | undefined {
  return TILINGS.find((t) => t.id === id)
}
