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

// Ordered for display: the two with real thumbnails lead, then the remaining uniform tilings.
// Target set = the 11 convex uniform Euclidean tilings + the prototype's octagon+wedge.
export const TILINGS: ReadonlyArray<TilingEntry> = [
  { id: 'square', name: 'Square', vertexConfig: '4.4.4.4', status: 'ready' },
  { id: 'kalleboda', name: 'Kalleboda', vertexConfig: 'octagon + wedge', status: 'ready' },
  { id: 'triangular', name: 'Triangular', vertexConfig: '3.3.3.3.3.3', status: 'planned' },
  { id: 'hexagonal', name: 'Hexagonal', vertexConfig: '6.6.6', status: 'planned' },
  { id: 'trihexagonal', name: 'Trihexagonal', vertexConfig: '3.6.3.6', status: 'planned' },
  { id: 'snub-square', name: 'Snub Square', vertexConfig: '3.3.4.3.4', status: 'planned' },
  { id: 'snub-hexagonal', name: 'Snub Hexagonal', vertexConfig: '3.3.3.3.6', status: 'planned' },
  { id: 'elongated-triangular', name: 'Elongated Triangular', vertexConfig: '3.3.3.4.4', status: 'planned' },
  { id: 'truncated-square', name: 'Truncated Square', vertexConfig: '4.8.8', status: 'planned' },
  { id: 'truncated-hexagonal', name: 'Truncated Hexagonal', vertexConfig: '3.12.12', status: 'planned' },
  { id: 'rhombitrihexagonal', name: 'Rhombitrihexagonal', vertexConfig: '3.4.6.4', status: 'planned' },
  { id: 'truncated-trihexagonal', name: 'Truncated Trihexagonal', vertexConfig: '4.6.12', status: 'planned' },
]

export function getTiling(id: string): TilingEntry | undefined {
  return TILINGS.find((t) => t.id === id)
}
