import './Workspace.css'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Tiling, TileNode } from '../tiling'
import { nodeById, neighborEdges, uniqueNeighbors } from '../tiling'
import {
  buildTiling,
  canPaste,
  applyClip,
  clipFromTile,
  addVisit,
  removeManualVisit,
  bumpRegistry,
  applyPaint,
  tileState,
  visitCount,
  overlayIsEmpty,
} from '../canvas'
import type { TileClip, TileState, Registry, PaintTarget } from '../canvas'
import { TilingCanvas, type DisplayMode } from './TilingCanvas'
import { TilingPicker } from './TilingPicker'
import { Panel } from './Panel'
import { HelpButton } from './HelpButton'
import { PredicatePane } from './PredicatePane'
import { ColoringPane } from './ColoringPane'
import { usePredicateStore } from '../state/predicateStore'
import { useColoringStore } from '../state/coloringStore'
import { colorize } from '../colorizer'
import { BUNDLED_PREDICATES } from '../data/bundledPredicates'

const GRID_MIN = 10
const GRID_MAX = 140

const REGISTRIES: ReadonlyArray<{ key: Registry; label: string }> = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
]

// The Canvas-page workspace: a central canvas flanked by collapsible docks — authoring panes
// (Traversers, Coloring) on the left, the Inspect pane on the right. It owns per-run state
// (selection, the tile overlay) off the immutable Tiling, and builds the Tiling itself from the
// picker choice + grid size.
export function Workspace() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Per-tile run state (visits-as-step-list + the A/B/C registries), keyed by tile id and kept off
  // the immutable Tiling (CLAUDE.md §4.3). See src/canvas/overlay.ts.
  const [overlay, setOverlay] = useState<ReadonlyMap<string, TileState>>(() => new Map())
  // What a drag paints: the visit log, or one of the registries.
  const [paintTarget, setPaintTarget] = useState<PaintTarget>('visited')
  // Tile display: edged outline / no outline / outline + printed stats (number + visited + counters).
  const [displayMode, setDisplayMode] = useState<DisplayMode>('edges')
  // Copied tile state, pasteable onto a same-shape tile.
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

  // The user's predicate library (bundled + custom) and coloring rules, persisted in the browser.
  // Lifted here so the colorizer below can read both.
  const predicateStore = usePredicateStore()
  const coloringStore = useColoringStore()

  // Built here from the picker choice + grid size (CLAUDE.md §4.3). Only the square has a
  // generator today; buildTiling falls back to it for any other id.
  const tiling = useMemo(() => buildTiling(tilingId, gridN), [tilingId, gridN])

  // Tile "number" — generation order for now; a user-facing scheme is tracked in CLAUDE.md §8.
  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    tiling.nodes.forEach((node, i) => map.set(node.id, i))
    return map
  }, [tiling])

  // Predicate id -> DSL text (bundled + custom), so a coloring rule can reference a predicate by id.
  const predicateText = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of BUNDLED_PREDICATES) map.set(b.id, b.text)
    for (const p of predicateStore.predicates) map.set(p.id, p.text)
    return map
  }, [predicateStore.predicates])

  // The tiling's appearance: evaluate the coloring rules per tile, once per input change (not per
  // frame). Tiles with no matching rule are absent and keep the base fill.
  const colorFor = useMemo(
    () => colorize(coloringStore.rules, predicateText, tiling, overlay, indexById),
    [coloringStore.rules, predicateText, tiling, overlay, indexById],
  )

  const selected = selectedId ? nodeById(tiling, selectedId) ?? null : null

  // Inspect ±: + adds a hand-made visit (step -1); − removes one (never touches traverser history).
  const bumpVisit = (id: string, delta: number) =>
    setOverlay((prev) => (delta >= 0 ? addVisit(prev, id) : removeManualVisit(prev, id)))
  const bumpReg = (id: string, reg: Registry, delta: number) =>
    setOverlay((prev) => bumpRegistry(prev, id, reg, delta))

  // Paint: bump each given tile's current paint target (the canvas dedupes within a stroke).
  const paint = (ids: ReadonlyArray<string>) => setOverlay((prev) => applyPaint(prev, ids, paintTarget))

  // Switching tiling type starts a fresh plane: drop the overlay and selection. Both are keyed by
  // tile id, which is only meaningful within one tiling — ids can collide across tilings (e.g. the
  // centroid-keyed squares the rhombitrihexagonal and truncated-trihexagonal generators share), so
  // a stale overlay would paint tiles on the new tiling. A grid-size change keeps the overlay
  // (non-destructive resize); only a type change resets it.
  const selectTiling = (id: string) => {
    if (id !== tilingId) {
      setOverlay(new Map())
      setSelectedId(null)
    }
    setTilingId(id)
  }

  // Copy the selected tile's state; paste onto the selected tile when shapes match.
  const copyTile = () => {
    if (selected) setClip(clipFromTile(selected.shape, tileState(overlay, selected.id)))
  }
  const pasteTile = () => {
    if (selected && canPaste(clip, selected.shape)) {
      setOverlay((prev) => applyClip(prev, selected.id, clip))
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

      <Panel title="Predicates" side="left" defaultCollapsed>
        <PredicatePane store={predicateStore} />
      </Panel>

      <Panel title="Coloring" side="left" defaultCollapsed>
        <ColoringPane store={coloringStore} customPredicates={predicateStore.predicates} />
      </Panel>

      <div className="canvas-pane">
        <header className="panel-head">
          <span className="panel-title">Canvas</span>
          <div className="canvas-tools">
            <TilingPicker value={tilingId} onChange={selectTiling} />
            <label className="canvas-chip canvas-paint" title="What a drag paints">
              paint:
              <select
                className="canvas-paint-select"
                value={paintTarget}
                aria-label="paint target"
                onChange={(e) => setPaintTarget(e.target.value as PaintTarget)}
              >
                <option value="visited">visited</option>
                <option value="a">A</option>
                <option value="b">B</option>
                <option value="c">C</option>
              </select>
            </label>
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
            <button
              type="button"
              className="canvas-btn"
              onClick={() => setOverlay(new Map())}
              disabled={overlayIsEmpty(overlay)}
              title="Reset the tiling — clears every visit and counter"
            >
              Reset
            </button>
            <button
              type="button"
              className="canvas-chip canvas-chip-btn"
              onClick={() => setDisplayMode((m) => (m === 'edges' ? 'none' : m === 'none' ? 'stats' : 'edges'))}
              title="Tile display — click to cycle: edges, none, stats"
            >
              display: {displayMode}
            </button>
          </div>
        </header>
        <div className="canvas-stage">
          <TilingCanvas
            tiling={tiling}
            displayMode={displayMode}
            selectedId={selectedId}
            overlay={overlay}
            colorFor={colorFor}
            tileNumber={(id) => indexById.get(id) ?? -1}
            onSelect={setSelectedId}
            onPaint={paint}
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
            overlay={overlay}
            clip={clip}
            onVisit={bumpVisit}
            onRegistry={bumpReg}
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
  overlay,
  clip,
  onVisit,
  onRegistry,
  onCopy,
  onPaste,
}: {
  tiling: Tiling
  node: TileNode
  number: number
  overlay: ReadonlyMap<string, TileState>
  clip: TileClip | null
  onVisit: (id: string, delta: number) => void
  onRegistry: (id: string, reg: Registry, delta: number) => void
  onCopy: () => void
  onPaste: () => void
}) {
  const st = tileState(overlay, node.id)
  const own = visitCount(st)
  // adjacent-visited-count: total visits across adjacent edges (a two-edge neighbour counts twice —
  // matches the prototype's adjacent-visited). adjacent-tiles-visited-count: distinct adjacent tiles
  // visited at least once. Identical for the edge-to-edge square tiling.
  const adjacentVisited = neighborEdges(tiling, node.id).reduce(
    (sum, e) => sum + visitCount(tileState(overlay, e.tile)),
    0,
  )
  const adjacentTilesVisited = uniqueNeighbors(tiling, node.id).filter(
    (id) => visitCount(tileState(overlay, id)) > 0,
  ).length

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
        <dt>
          visited
          <HelpButton title="Visits &amp; steps">
            <p>
              Every time a tile is visited, that visit is recorded — along with <strong>which step
              (tick)</strong> it happened on. The <strong>visited</strong> number is just how many
              visits there are.
            </p>
            <p>
              Visits you add by hand — painting, or the + here — are stamped <strong>step −1</strong>,
              meaning “outside a run”. Once traverser rules arrive, each automatic visit will carry
              its real tick number, so you’ll be able to ask <em>when</em> a tile was reached, not
              only how often.
            </p>
          </HelpButton>
        </dt>
        <dd className="visited-control">
          <button type="button" onClick={() => onVisit(node.id, -1)} aria-label="decrease visited">
            −
          </button>
          <span className="visited-value">{own}</span>
          <button type="button" onClick={() => onVisit(node.id, 1)} aria-label="increase visited">
            +
          </button>
        </dd>
        <dt>steps</dt>
        <dd className="steps-readout">{formatSteps(st.visits)}</dd>
        <dt title="adjacent-visited-count: visited adjacent edges (a two-edge neighbour counts twice)">adj-v-count</dt>
        <dd>{adjacentVisited}</dd>
        <dt title="adjacent-tiles-visited-count: distinct adjacent tiles visited">adj-t-v-count</dt>
        <dd>{adjacentTilesVisited}</dd>
        <dt className="reg-head">
          registries
          <HelpButton title="Registries A, B, C">
            <p>
              A, B and C are three <strong>free-form counters</strong> on every tile. The app gives
              them no built-in meaning — they’re yours to use.
            </p>
            <p>
              Soon you’ll read and change them from traverser rules: count something, mark a tile,
              leave a breadcrumb, gate a branch — whatever a pattern needs. For now, set them here or
              with the paint tool to experiment.
            </p>
          </HelpButton>
        </dt>
        <dd className="reg-hint">free-form</dd>
        {REGISTRIES.map(({ key, label }) => (
          <Fragment key={key}>
            <dt>{label}</dt>
            <dd className="reg-control">
              <button type="button" onClick={() => onRegistry(node.id, key, -1)} aria-label={`decrease ${label}`}>
                −
              </button>
              <span className={`reg-value reg-${key}`}>{st[key]}</span>
              <button type="button" onClick={() => onRegistry(node.id, key, 1)} aria-label={`increase ${label}`}>
                +
              </button>
            </dd>
          </Fragment>
        ))}
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
          <span className="clip-readout">
            {clip
              ? `v${visitCount(clip.state)} · A${clip.state.a} B${clip.state.b} C${clip.state.c} · ${clip.shape}`
              : 'empty'}
          </span>
        </dd>
      </dl>
    </div>
  )
}

// Compact readout of the visit step-list. All hand-made visits are step −1 today; traverser rules
// will add real tick numbers. Cap the length so a heavily-visited tile stays readable.
function formatSteps(visits: ReadonlyArray<number>): string {
  if (visits.length === 0) return '—'
  const shown = visits.slice(0, 10).map((s) => (s < 0 ? `−${-s}` : String(s)))
  const extra = visits.length - 10
  return extra > 0 ? `${shown.join(', ')} … (+${extra})` : shown.join(', ')
}

// Per-tiling coordinates. Each tiling names its own lattice dimensions in `meta.latticeLabels`
// (e.g. square → row/column, triangular → i/j/orientation), so the readout shows the right number
// of coordinates with meaningful labels for any tiling — including the third coordinate that makes
// triangle/multi-shape tiles unique. Falls back to `coord N` if a label is ever missing.
function tileStats(tiling: Tiling, node: TileNode): ReadonlyArray<{ label: string; value: number }> {
  const labels = tiling.meta.latticeLabels
  return node.lattice.map((value, i) => ({ label: labels[i] ?? `coord ${i}`, value }))
}
