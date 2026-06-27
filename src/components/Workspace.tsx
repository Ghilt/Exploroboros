import './Workspace.css'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import type { Tiling, TileNode } from '../tiling'
import { nodeById, neighborEdges, uniqueNeighbors } from '../tiling'
import { TilingDebugView } from './TilingDebugView'
import { Panel } from './Panel'

// The Canvas-page workspace: a central canvas flanked by collapsible docks — authoring
// panes (Traversers, Coloring) on the left, the Inspect pane on the right. Per-tile run
// state (visited counts) is held here, off the immutable Tiling.
export function Workspace({ tiling }: { tiling: Tiling }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [visited, setVisited] = useState<ReadonlyMap<string, number>>(() => new Map())
  const [showNumbers, setShowNumbers] = useState(false)

  // Tile "number" — simplest scheme for now is generation order; making it a user-facing
  // control is tracked in CLAUDE.md §8.
  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    tiling.nodes.forEach((node, i) => map.set(node.id, i))
    return map
  }, [tiling])

  const selected = selectedId ? nodeById(tiling, selectedId) ?? null : null

  const bumpVisited = (id: string, delta: number) =>
    setVisited((prev) => {
      const next = new Map(prev)
      next.set(id, Math.max(0, (next.get(id) ?? 0) + delta))
      return next
    })

  return (
    <div className="workspace">
      <Panel title="Traversers" side="left" defaultCollapsed>
        <PaneScaffold>
          A list of traversers — each an agent with DSL code describing how it walks the
          graph and paints tiles. This is where fractal behaviour will be authored.
        </PaneScaffold>
      </Panel>

      <Panel title="Coloring" side="left" defaultCollapsed>
        <PaneScaffold>
          Coloring rules applied across the whole grid — tile and edge predicates mapping to
          colours, stacked and blended.
        </PaneScaffold>
      </Panel>

      <div className="canvas-pane">
        <header className="panel-head">
          <span className="panel-title">Canvas</span>
          <label className="canvas-toggle">
            <input
              type="checkbox"
              checked={showNumbers}
              onChange={(e) => setShowNumbers(e.target.checked)}
            />
            numbers
          </label>
        </header>
        <div className="canvas-stage">
          <TilingDebugView
            tiling={tiling}
            showNumbers={showNumbers}
            selectedId={selectedId}
            visited={visited}
            tileNumber={(id) => indexById.get(id) ?? -1}
            onSelect={setSelectedId}
          />
        </div>
      </div>

      <Panel title="Inspect" side="right">
        {selected ? (
          <InspectContent
            tiling={tiling}
            node={selected}
            number={indexById.get(selected.id) ?? -1}
            visited={visited}
            onBump={bumpVisited}
          />
        ) : (
          <p className="pane-hint">Click a tile to inspect it.</p>
        )}
      </Panel>
    </div>
  )
}

function PaneScaffold({ children }: { children: ReactNode }) {
  return (
    <div className="pane-scaffold">
      <p className="pane-scaffold-tag">Scaffold</p>
      <p>{children}</p>
      <p className="pane-scaffold-soon">Coming in a later phase.</p>
    </div>
  )
}

function InspectContent({
  tiling,
  node,
  number,
  visited,
  onBump,
}: {
  tiling: Tiling
  node: TileNode
  number: number
  visited: ReadonlyMap<string, number>
  onBump: (id: string, delta: number) => void
}) {
  const own = visited.get(node.id) ?? 0
  // adjacent-visited-count: total visits across adjacent edges (a two-edge neighbour counts
  // twice — matches the prototype's adjacent-visited). adjacent-tiles-visited-count: distinct
  // adjacent tiles visited at least once. Identical for the edge-to-edge square tiling.
  const adjacentVisited = neighborEdges(tiling, node.id).reduce((sum, e) => sum + (visited.get(e.tile) ?? 0), 0)
  const adjacentTilesVisited = uniqueNeighbors(tiling, node.id).filter((id) => (visited.get(id) ?? 0) > 0).length

  return (
    <div className="tile-stats">
      <h3 className="stat-head">Tile #{number}</h3>
      <dl>
        {tileStats(tiling, node).map((stat) => (
          <Fragment key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </Fragment>
        ))}
        <dt>visited</dt>
        <dd className="visited-control">
          <button type="button" onClick={() => onBump(node.id, -1)} aria-label="decrease visited">
            −
          </button>
          <span className="visited-value">{own}</span>
          <button type="button" onClick={() => onBump(node.id, 1)} aria-label="increase visited">
            +
          </button>
        </dd>
        <dt>adjacent-visited-count</dt>
        <dd>{adjacentVisited}</dd>
        <dt>adjacent-tiles-visited-count</dt>
        <dd>{adjacentTilesVisited}</dd>
      </dl>
    </div>
  )
}

// Per-tiling stats. Different tilings expose different intrinsic coordinates; the square
// tiling shows row/column from its lattice. Extend per tiling id as more are added.
function tileStats(tiling: Tiling, node: TileNode): ReadonlyArray<{ label: string; value: number }> {
  if (tiling.meta.id === 'square') {
    const [row, col] = node.lattice
    return [
      { label: 'row', value: row },
      { label: 'column', value: col },
    ]
  }
  return node.lattice.map((value, i) => ({ label: `coord ${i}`, value }))
}
