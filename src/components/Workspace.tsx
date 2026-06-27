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
  addVisits,
  removeManualVisit,
  bumpRegistry,
  applyPaint,
  tileState,
  visitCount,
  overlayIsEmpty,
  clearTraverserVisits,
  hasTraverserVisits,
} from '../canvas'
import type { TileClip, TileState, Registry, PaintTarget } from '../canvas'
import { stepTraversers, headingOptions, rotateHeading, type Traverser } from '../traverse'
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

// Traverser clock speeds. slow/fast are an interval (ms between ticks); 'max' runs one tick per
// animation frame (as fast as the machine paints). A chip next to Stop cycles these, like the
// display-mode chip.
type RunSpeed = 'slow' | 'fast' | 'max'
const SPEED_MS: Record<Exclude<RunSpeed, 'max'>, number> = { slow: 300, fast: 90 }

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
  // The traverse run. `seeds` is the AUTHORED initial state — the walkers the user placed and aimed,
  // i.e. the savable "starting position" of a fractal. A run works on a COPY (`runLive`) so the
  // originals are never lost: `runLive` is null while stopped (we then show `seeds`) and an array
  // while a run is playing or paused. `step` is the tick a new visit is stamped with. See
  // src/traverse/. Kept off the immutable Tiling like the overlay.
  const [seeds, setSeeds] = useState<Traverser[]>([])
  const [runLive, setRunLive] = useState<Traverser[] | null>(null)
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const [speed, setSpeed] = useState<RunSpeed>('fast')
  const traverserSeq = useRef(0)
  // Tile display: edged outline / no outline / outline + printed stats (number + visited + counters).
  const [displayMode, setDisplayMode] = useState<DisplayMode>('edges')
  // Mobile only: Fit / Reset / grid-size live behind a "⋯" button; this toggles that dropdown.
  const [toolsOpen, setToolsOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
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

  // Tile id -> heading for the canvas to draw each walker's arrow (stats mode only). Show the live
  // run if one's in progress, else the authored seeds.
  const traverserHeads = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of runLive ?? seeds) m.set(t.tile, t.heading)
    return m
  }, [runLive, seeds])

  // The clock. A reassigned ref keeps the interval calling the LATEST state each tick (the
  // copyRef/pasteRef pattern below), so listeners attach once yet never read stale state. The tick
  // itself is the pure stepTraversers; we auto-pause when every walker has died.
  const tickRef = useRef<() => void>(() => {})
  tickRef.current = () => {
    if (runLive === null) return
    const result = stepTraversers({ tiling, overlay, traversers: runLive, step })
    setOverlay(result.overlay)
    setRunLive(result.traversers)
    setStep(result.step)
    if (result.traversers.length === 0) setRunning(false) // every walker died -> auto-pause
  }
  useEffect(() => {
    if (!running) return
    if (speed === 'max') {
      let raf = 0
      const loop = () => {
        tickRef.current()
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(raf)
    }
    const handle = setInterval(() => tickRef.current(), SPEED_MS[speed])
    return () => clearInterval(handle)
  }, [running, speed])

  // Close the mobile "⋯" tools dropdown on an outside tap / Escape.
  useEffect(() => {
    if (!toolsOpen) return
    const onDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setToolsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setToolsOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [toolsOpen])

  const selected = selectedId ? nodeById(tiling, selectedId) ?? null : null
  // Walkers to show + inspect: the live run if one's in progress, else the authored seeds. Authoring
  // (place/remove/aim) is only allowed while stopped (`runLive === null`).
  const walkers = runLive ?? seeds
  const stopped = runLive === null
  const selectedTraverser = selected ? walkers.find((t) => t.tile === selected.id) ?? null : null

  // ---- traverser run controls ----
  const play = () => {
    if (walkers.length === 0) return
    if (runLive === null) {
      // Start a fresh run from the authored seeds — on a COPY, so the seeds stay intact for Stop to
      // restore — and mark each walker's starting tile visited at step 0.
      const live = seeds.map((s) => ({ ...s }))
      setRunLive(live)
      setStep(0)
      setOverlay((prev) => addVisits(prev, live.map((t) => t.tile), 0))
    }
    setRunning(true)
  }
  const pause = () => setRunning(false)
  const cycleSpeed = () => setSpeed((s) => (s === 'slow' ? 'fast' : s === 'fast' ? 'max' : 'slow'))
  // Stop: discard the live run and clear its trail (step >= 0 visits), restoring the AUTHORED state —
  // the placed walkers (seeds) reappear and only hand-painted tiles (step -1) remain. Only Reset
  // removes the seeds.
  const stopRun = () => {
    setRunning(false)
    setRunLive(null)
    setStep(0)
    setOverlay((prev) => clearTraverserVisits(prev))
  }
  // Full Reset: wipe everything (painting + placed walkers) and end any run.
  const resetAll = () => {
    setRunning(false)
    setRunLive(null)
    setSeeds([])
    setStep(0)
    setOverlay(new Map())
  }

  // Authoring the initial state (only while stopped): place / remove / aim walkers. These edit
  // `seeds`, the savable starting position — never the live run. Placement records no visit; the
  // walk records visits once it runs.
  const placeTraverser = (id: string) => {
    if (seeds.some((t) => t.tile === id)) return
    const heading = headingOptions(tiling, id)[0] ?? 0
    const tid = `tr${(traverserSeq.current += 1)}`
    setSeeds((list) => [...list, { id: tid, tile: id, heading }])
  }
  const removeTraverser = (id: string) => setSeeds((list) => list.filter((t) => t.tile !== id))
  const rotateTraverser = (id: string, dir: 1 | -1) =>
    setSeeds((list) =>
      list.map((t) => (t.tile === id ? { ...t, heading: rotateHeading(tiling, id, t.heading, dir) } : t)),
    )

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
      // Walkers are keyed by tile id, meaningless on another tiling — end the run + drop the seeds.
      setRunning(false)
      setRunLive(null)
      setSeeds([])
      setStep(0)
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
          <div className="canvas-run" role="group" aria-label="traverser run">
            <button
              type="button"
              className="run-btn"
              onClick={play}
              disabled={running || walkers.length === 0}
              aria-label="Play — run the traversers"
              title="Play — run the traversers"
            >
              ▶
            </button>
            <button
              type="button"
              className="run-btn"
              onClick={pause}
              disabled={!running}
              aria-label="Pause — stop ticking, keep the walkers"
              title="Pause — stop ticking, keep the walkers"
            >
              ❚❚
            </button>
            <button
              type="button"
              className="run-btn"
              onClick={stopRun}
              disabled={!running && runLive === null && !hasTraverserVisits(overlay)}
              aria-label="Stop — end the run and clear its trail (keeps the walkers and your painting)"
              title="Stop — end the run and clear its trail (keeps the walkers and your painting)"
            >
              ■
            </button>
            <button
              type="button"
              className="canvas-chip canvas-chip-btn run-speed"
              onClick={cycleSpeed}
              title="Run speed — click to cycle: slow, fast, max"
            >
              speed: {speed}
            </button>
          </div>
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
            <button
              type="button"
              className="canvas-chip canvas-chip-btn"
              onClick={() => setDisplayMode((m) => (m === 'edges' ? 'none' : m === 'none' ? 'stats' : 'edges'))}
              title="Tile display — click to cycle: edges, none, stats"
            >
              display: {displayMode}
            </button>
            {/* Fit / Reset / grid-size: inline on desktop, behind a ⋯ button on mobile. */}
            <div className="canvas-more-wrap" ref={moreRef}>
              <button
                type="button"
                className="canvas-btn canvas-more"
                onClick={() => setToolsOpen((o) => !o)}
                aria-label="more controls"
                aria-expanded={toolsOpen}
                title="More controls"
              >
                ⋯
              </button>
              <div className={`canvas-extra${toolsOpen ? ' is-open' : ''}`}>
                <label
                  className="canvas-grid"
                  title={runLive !== null ? 'Stop the run to resize the grid' : 'Grid size — tiles = N × N'}
                >
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
                    disabled={runLive !== null}
                    onChange={(e) => setGridInput(Number(e.target.value))}
                  />
                </label>
                <button type="button" className="canvas-btn" onClick={() => setFitNonce((n) => n + 1)}>
                  Fit
                </button>
                <button
                  type="button"
                  className="canvas-btn"
                  onClick={resetAll}
                  disabled={overlayIsEmpty(overlay) && seeds.length === 0 && runLive === null}
                  title="Reset — clears every visit and counter, and removes the walkers"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </header>
        <div className="canvas-stage">
          <TilingCanvas
            tiling={tiling}
            displayMode={displayMode}
            selectedId={selectedId}
            overlay={overlay}
            colorFor={colorFor}
            traverserHeads={traverserHeads}
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
            traverserHeading={selectedTraverser ? selectedTraverser.heading : null}
            canEditTraverser={stopped}
            onVisit={bumpVisit}
            onRegistry={bumpReg}
            onCopy={copyTile}
            onPaste={pasteTile}
            onPlaceTraverser={placeTraverser}
            onRemoveTraverser={removeTraverser}
            onRotateTraverser={rotateTraverser}
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
  traverserHeading,
  canEditTraverser,
  onVisit,
  onRegistry,
  onCopy,
  onPaste,
  onPlaceTraverser,
  onRemoveTraverser,
  onRotateTraverser,
}: {
  tiling: Tiling
  node: TileNode
  number: number
  overlay: ReadonlyMap<string, TileState>
  clip: TileClip | null
  // The heading (radians) of the walker on this tile, or null if there isn't one here.
  traverserHeading: number | null
  // Whether placements can be edited — only while stopped (a run owns the walkers).
  canEditTraverser: boolean
  onVisit: (id: string, delta: number) => void
  onRegistry: (id: string, reg: Registry, delta: number) => void
  onCopy: () => void
  onPaste: () => void
  onPlaceTraverser: (id: string) => void
  onRemoveTraverser: (id: string) => void
  onRotateTraverser: (id: string, dir: 1 | -1) => void
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

      <div className="tile-traverser">
        <div className="trav-head">
          <span className="trav-title">traverser</span>
          <HelpButton title="Traversers">
            <p>
              A <strong>traverser</strong> is a walker that sits on a tile. Press <strong>Play</strong>{' '}
              (top-left of the canvas) and each tick it steps to an adjacent tile it hasn’t visited yet,
              following its <strong>heading</strong> (the arrow) as best it can — leaving a visited trail.
            </p>
            <p>
              Place one here, then aim it with <strong>↺ / ↻</strong>. <strong>Pause</strong> freezes the
              walk; <strong>Stop</strong> (■) ends it and clears the trail but keeps the walkers (and tiles
              you painted by hand — so painted tiles act as walls to route around). Only <strong>Reset</strong>{' '}
              removes the walkers. See the trail in <em>display: stats</em> or with a coloring rule.
            </p>
          </HelpButton>
        </div>
        {!canEditTraverser ? (
          <p className="trav-note">Stop the run to edit the walkers.</p>
        ) : traverserHeading === null ? (
          <button type="button" className="trav-place" onClick={() => onPlaceTraverser(node.id)}>
            Place traverser
          </button>
        ) : (
          <div className="trav-controls">
            <button
              type="button"
              className="trav-rot"
              onClick={() => onRotateTraverser(node.id, -1)}
              aria-label="rotate heading left"
            >
              ↺
            </button>
            <HeadingArrow heading={traverserHeading} />
            <button
              type="button"
              className="trav-rot"
              onClick={() => onRotateTraverser(node.id, 1)}
              aria-label="rotate heading right"
            >
              ↻
            </button>
            <button type="button" className="trav-remove" onClick={() => onRemoveTraverser(node.id)}>
              Remove
            </button>
          </div>
        )}
      </div>

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

// A small arrow showing a walker's heading. Heading is radians, world y-up (a side's outward
// normal); screen is y-down, so the on-screen rotation negates it — matching the canvas arrow.
function HeadingArrow({ heading }: { heading: number }) {
  const deg = (-heading * 180) / Math.PI
  return (
    <svg
      className="heading-arrow"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      style={{ transform: `rotate(${deg}deg)` }}
    >
      <path
        d="M3 12 H18 M13 7 L19 12 L13 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
