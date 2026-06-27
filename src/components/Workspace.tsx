import './Workspace.css'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Tiling, TileNode } from '../tiling'
import { nodeById, neighborEdges, uniqueNeighbors } from '../tiling'
import { buildTiling, canPaste, applyClip, clipFromTile } from '../canvas'
import type { TileClip } from '../canvas'
import { TilingCanvas } from './TilingCanvas'
import { TilingPicker } from './TilingPicker'
import { Panel } from './Panel'

const GRID_MIN = 10
const GRID_MAX = 140

// The Canvas-page workspace: a central canvas flanked by collapsible docks — authoring panes
// (Traversers, Coloring) on the left, the Inspect pane on the right. It owns per-run state
// (selection, the visited overlay) off the immutable Tiling, and builds the Tiling itself from
// the picker choice + grid size.
export function Workspace() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [visited, setVisited] = useState<ReadonlyMap<string, number>>(() => new Map())
  const [showNumbers, setShowNumbers] = useState(false)
  // Copied tile attributes (today: the visited count), pasteable onto a same-shape tile.
  const [clip, setClip] = useState<TileClip | null>(null)
  // Bumped to ask the canvas to re-frame the whole tiling (Fit button).
  const [fitNonce, setFitNonce] = useState(0)
  const [tilingId, setTilingId] = useState('square')
  // Grid size: `gridInput` tracks the slider live (cheap label updates); `gridN` is the size the
  // tiling is actually built at — committed a beat after the slider settles so a drag doesn't
  // rebuild a big tiling every tick.
  const [gridInput, setGridInput] = useState(20)
  const [gridN, setGridN] = useState(20)
  useEffect(() => {
    const t = setTimeout(() => setGridN(gridInput), 180)
    return () => clearTimeout(t)
  }, [gridInput])

  // Built here from the picker choice + grid size (CLAUDE.md §4.3). Only the square has a
  // generator today; buildTiling falls back to it for any other id.
  const tiling = useMemo(() => buildTiling(tilingId, gridN), [tilingId, gridN])

  // Tile "number" — generation order for now; a user-facing scheme is tracked in CLAUDE.md §8.
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

  // Paint: bump each given tile by +1 (the canvas dedupes within a stroke).
  const paintVisited = (ids: ReadonlyArray<string>) => {
    if (ids.length === 0) return
    setVisited((prev) => {
      const next = new Map(prev)
      for (const id of ids) next.set(id, (next.get(id) ?? 0) + 1)
      return next
    })
  }

  // Copy the selected tile's attributes; paste onto the selected tile when shapes match.
  const copyTile = () => {
    if (selected) setClip(clipFromTile(selected.shape, visited.get(selected.id) ?? 0))
  }
  const pasteTile = () => {
    if (selected && canPaste(clip, selected.shape)) {
      setVisited((prev) => applyClip(prev, selected.id, clip))
    }
  }

  // Desktop Ctrl/Cmd+C / +V mirror the Inspect-dock Copy/Paste buttons (for mobile). Attached
  // once; the refs keep it reading the latest state. Ignored while typing or with a live text
  // selection so it never hijacks a real copy.
  const copyRef = useRef(copyTile)
  copyRef.current = copyTile
  const pasteRef = useRef(pasteTile)
  pasteRef.current = pasteTile
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key !== 'c' && key !== 'v') return
      const el = document.activeElement
      if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return
      }
      if (key === 'c') {
        if (!window.getSelection()?.isCollapsed) return // a real text selection -> let the browser copy
        copyRef.current()
      } else {
        pasteRef.current()
      }
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

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
          <div className="canvas-tools">
            <TilingPicker value={tilingId} onChange={setTilingId} />
            <span className="canvas-chip" title="Drag paints the visited count (other attributes later)">
              paint: visited
            </span>
            <label className="canvas-grid" title="Grid size — tiles = N × N">
              <span className="canvas-grid-label">
                {gridInput}×{gridInput}
              </span>
              <input
                type="range"
                min={GRID_MIN}
                max={GRID_MAX}
                step={10}
                value={gridInput}
                aria-label="grid size"
                onChange={(e) => setGridInput(Number(e.target.value))}
              />
            </label>
            <button type="button" className="canvas-btn" onClick={() => setFitNonce((n) => n + 1)}>
              Fit
            </button>
            <label className="canvas-toggle">
              <input
                type="checkbox"
                checked={showNumbers}
                onChange={(e) => setShowNumbers(e.target.checked)}
              />
              numbers
            </label>
          </div>
        </header>
        <div className="canvas-stage">
          <TilingCanvas
            tiling={tiling}
            showNumbers={showNumbers}
            selectedId={selectedId}
            visited={visited}
            tileNumber={(id) => indexById.get(id) ?? -1}
            onSelect={setSelectedId}
            onPaint={paintVisited}
            fitSignal={fitNonce}
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
            clip={clip}
            onBump={bumpVisited}
            onCopy={copyTile}
            onPaste={pasteTile}
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
  clip,
  onBump,
  onCopy,
  onPaste,
}: {
  tiling: Tiling
  node: TileNode
  number: number
  visited: ReadonlyMap<string, number>
  clip: TileClip | null
  onBump: (id: string, delta: number) => void
  onCopy: () => void
  onPaste: () => void
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
        <dt>clipboard</dt>
        <dd className="clip-control">
          <button type="button" onClick={onCopy} aria-label="copy tile attributes">
            Copy
          </button>
          <button
            type="button"
            onClick={onPaste}
            disabled={!canPaste(clip, node.shape)}
            aria-label="paste tile attributes"
          >
            Paste
          </button>
          <span className="clip-readout">{clip ? `v${clip.attrs.visited} · ${clip.shape}` : 'empty'}</span>
        </dd>
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
