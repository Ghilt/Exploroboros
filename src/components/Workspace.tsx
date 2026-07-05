import './Workspace.css'
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { Tiling, TileNode } from '../tiling'
import { nodeById, neighborEdges, uniqueNeighbors, tileOrientation, headingArrowDir } from '../tiling'
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
  authoredBoard,
  hasTraverserVisits,
  MANUAL_STEP,
} from '../canvas'
import type { TileClip, TileState, Registry, PaintTarget } from '../canvas'
import { stepTraversers, stepTraversersTraced, rotateHeading, compileProgram, DEFAULT_SETTINGS, type Traverser, type Program, type TickTrace } from '../traverse'
import { compileDoc, resolveInitialState, mergeByTile, applyInitWrites, type InitResolved } from '../initstate'
import { TilingCanvas, type DisplayMode, type DragMode, type HighlightGroups } from './TilingCanvas'
import { TilingPicker } from './TilingPicker'
import { Panel } from './Panel'
import { TileMini } from './TileMini'
import { HelpButton } from './HelpButton'
import { ConfirmDialog } from './ConfirmDialog'
import { SegmentedControl } from './SegmentedControl'
import { SpeedBar, type SpeedStop } from './SpeedBar'
import { Stepper } from './Stepper'
import { DebugPane } from './DebugPane'
import { CustomPredicatesDialog } from './CustomPredicatesDialog'
import { TraversersPane } from './TraversersPane'
import { ColoringPane } from './ColoringPane'
import { InitialStatePane } from './InitialStatePane'
import { ExportMenu } from './ExportMenu'
import { ExportStrip, type ExportItem } from './ExportStrip'
import { UploadDialog } from './UploadDialog'
import { ImageViewer } from './ImageViewer'
import { usePredicateStore } from '../state/predicateStore'
import { useTraverserStore } from '../state/traverserStore'
import { useColoringStore } from '../state/coloringStore'
import { useInitialStateStore, makeInitialState } from '../state/initialStateStore'
import { colorize } from '../colorizer'
import { downloadBlob, exportFilename } from '../export/download'
import { generateExport, isAbortError, type ExportParams } from '../export/exportImage'
import { remapSeeds, remapPaint, parseRecipe, decodeRecipeFromPng, type Recipe } from '../export'
import { takePendingRecipe } from '../state/pendingRecipe'
import { BUNDLED_PREDICATES } from '../data/bundledPredicates'

const GRID_MIN = 10
const GRID_MAX = 140

// A stable empty Initial-state resolution — used when the document is blank or fails to compile, so the
// downstream memos don't churn on a fresh object each render.
const EMPTY_INIT: InitResolved = { seeds: [], writes: [], unknownRefs: [] }

// Debug log: keep at most this many recent ticks' decision traces (a ring) — plenty to scrub back
// through while step-debugging, but bounded so a fast run can't grow it without limit.
const TRACE_HISTORY = 64

// Traverser clock speeds (turtle → rabbit), selected by the SpeedBar under the transport buttons. The
// three interval paces are ms between ticks; 'max' runs one tick per animation frame (as fast as the
// machine paints). 'step' is no longer a speed — it's the Step button, advancing one tick on demand.
const SPEED_MS: Record<Exclude<SpeedStop, 'max'>, number> = { vslow: 500, slow: 180, fast: 50 }

const REGISTRIES: ReadonlyArray<{ key: Registry; label: string }> = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
]

// Paint targets offered in the drag popup. (Painting traverser seeds will join this once named
// traversers exist — see CLAUDE.md §8.)
const PAINT_TARGETS: ReadonlyArray<{ key: PaintTarget; label: string }> = [
  { key: 'visited', label: 'Visited' },
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
]
const paintLabel = (t: PaintTarget) => (t === 'visited' ? 'visited' : t.toUpperCase())

// The always-available built-in definition: step to the least-turn unvisited neighbour (what the
// engine used to hardcode). Listed first in the placement picker so a fresh app can place + run.
const BUILTIN_WALKER = 'Walker'
const BUILTIN_WALKER_TEXT = 'move nearest-unvisited'

// The Canvas-page workspace: a central canvas flanked by collapsible docks — authoring panes
// (Traversers, Coloring) on the left, inspection panes (Inspect + its traverser log, Initial state) on
// the right, at most one open per side at a time. It owns per-run state (selection, the tile overlay)
// off the immutable Tiling, and builds the Tiling itself from the picker choice + grid size.
export function Workspace() {
  // Selected tiles: one (tap / single-tile inspect) or many (select-mode box → bulk edit).
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Per-tile run state (visits-as-step-list + the A/B/C registries), keyed by tile id and kept off
  // the immutable Tiling (CLAUDE.md §4.3). See src/canvas/overlay.ts.
  const [overlay, setOverlay] = useState<ReadonlyMap<string, TileState>>(() => new Map())
  // What a one-pointer drag does: paint the target, box-select tiles, or nothing (mobile page
  // scroll). Defaults to "off" so a drag doesn't paint by accident — especially on touch.
  const [dragMode, setDragMode] = useState<DragMode>('off')
  // What a paint drag writes: the visit log, or one of the registries. Chosen from the drag popup.
  const [paintTarget, setPaintTarget] = useState<PaintTarget>('visited')
  // The drag-control popup (mode + paint target in one menu).
  const [dragMenuOpen, setDragMenuOpen] = useState(false)
  const dragMenuRef = useRef<HTMLDivElement>(null)
  // The traverse run. `seeds` is the AUTHORED initial state — the walkers the user placed and aimed,
  // i.e. the savable "starting position" of a fractal. A run works on a COPY (`runLive`) so the
  // originals are never lost: `runLive` is null while stopped (we then show `seeds`) and an array
  // while a run is playing or paused. `step` is the tick a new visit is stamped with. See
  // src/traverse/. Kept off the immutable Tiling like the overlay.
  const [seeds, setSeeds] = useState<Traverser[]>([])
  const [runLive, setRunLive] = useState<Traverser[] | null>(null)
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const [speed, setSpeed] = useState<SpeedStop>('slow')
  const traverserSeq = useRef(0)
  // The authored board (visits + A/B/C) as it stood when the current run started — snapshotted at
  // initRun so Stop can revert the run's registry writes back to their pre-run values (registries have
  // no per-write stamp, so unlike visits they can't be surgically un-done without this).
  const authoredOverlayRef = useRef<ReadonlyMap<string, TileState>>(new Map())
  // The docks are an accordion: at most ONE pane open per side of the canvas (opening one collapses the
  // other on that side). Right starts on Inspect; left starts closed.
  const [leftOpen, setLeftOpen] = useState<'traversers' | 'coloring' | null>(null)
  const [rightOpen, setRightOpen] = useState<'inspect' | 'initial' | null>('inspect')
  const toggleLeft = (p: 'traversers' | 'coloring') => setLeftOpen((cur) => (cur === p ? null : p))
  const toggleRight = (p: 'inspect' | 'initial') => setRightOpen((cur) => (cur === p ? null : p))
  // The shared Custom-predicates dialog, opened by the badge at the foot of the authoring panes (predicates
  // no longer have their own dock).
  const [predsOpen, setPredsOpen] = useState(false)
  // A per-tick decision log lives at the bottom of the Inspect pane, plus canvas highlighting of the tiles a
  // hovered log row is about. The trace is built only while the Inspect pane is open (`traceOn`, below) — the
  // zero-cost-when-hidden replacement for the old debug toggle.
  // Recent ticks' decision traces (a bounded ring) and which one the log is viewing (null = follow the
  // latest). `hoveredHighlight` (a log-row hover) wins over `pinned` (a clicked row) for the canvas.
  const [traceHistory, setTraceHistory] = useState<TickTrace[]>([])
  const [viewedStep, setViewedStep] = useState<number | null>(null)
  const [hoveredHighlight, setHoveredHighlight] = useState<HighlightGroups | null>(null)
  const [pinned, setPinned] = useState<{ key: string; groups: HighlightGroups } | null>(null)
  const pushTrace = (t: TickTrace) => setTraceHistory((h) => [...h, t].slice(-TRACE_HISTORY))
  // Clear the debug log + any highlight — on a fresh run, a stop/reset, or a tiling/recipe switch.
  const clearDebug = () => {
    setTraceHistory([])
    setViewedStep(null)
    setHoveredHighlight(null)
    setPinned(null)
  }
  const highlightGroups = hoveredHighlight ?? pinned?.groups
  // Build the decision trace + draw highlights only while the Inspect pane (which hosts the log) is open.
  const traceOn = rightOpen === 'inspect'
  // Selecting a tile opens the Inspect pane — otherwise the accordion could leave Initial state open on the
  // right and hide the tile you just clicked. No-op when Inspect is already the open right pane.
  useEffect(() => {
    if (selectedIds.length > 0) setRightOpen('inspect')
  }, [selectedIds])
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

  // The user's predicate library (bundled + custom), traverser definitions, and coloring rules,
  // persisted in the browser. Lifted here so the colorizer + the traverse run can read them.
  const predicateStore = usePredicateStore()
  const traverserStore = useTraverserStore()
  const coloringStore = useColoringStore()
  const initialStateStore = useInitialStateStore()
  // Which definition the Inspect "Place" buttons instantiate.
  const [placeDef, setPlaceDef] = useState(BUILTIN_WALKER)

  // Exported images, held for the session (each also auto-downloads — object URLs die on reload).
  // `viewingId` swaps the live canvas for the image viewer when an export thumbnail is opened.
  const [exports, setExports] = useState<ExportItem[]>([])
  const [viewingId, setViewingId] = useState<string | null>(null)
  const exportSeq = useRef(0)
  // Abort controllers for in-flight export jobs, keyed by item id (cancel = terminate the worker).
  const jobControllers = useRef(new Map<string, AbortController>())
  // Drag-and-drop of an exported PNG onto the canvas to reopen it; `dropNote` is a transient result toast.
  const [dropActive, setDropActive] = useState(false)
  const [dropNote, setDropNote] = useState<string | null>(null)
  // The finished export whose "Share to the gallery" dialog is open (null = closed).
  const [uploadItem, setUploadItem] = useState<ExportItem | null>(null)
  // A parsed recipe waiting on the "replace your work?" confirmation (set only when the panes already
  // hold user-authored data). The hidden file input backs the clickable "import" hint (mobile's path in).
  const [pendingImport, setPendingImport] = useState<Recipe | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Predicate NAME -> DSL text, so a traverser guard can reference a saved predicate by name.
  const predicateNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of BUNDLED_PREDICATES) map.set(b.name, b.text)
    for (const p of predicateStore.predicates) if (p.name) map.set(p.name, p.text)
    return map
  }, [predicateStore.predicates])

  // Definition name -> compiled program. The built-in Walker plus every user definition that
  // compiles; broken ones are simply absent (so they can't be placed/run). Rebuilt only when the
  // definitions or referenced predicates change — not per frame.
  const defs = useMemo(() => {
    const map = new Map<string, Program>()
    const walker = compileProgram(BUILTIN_WALKER_TEXT, predicateNames)
    if (walker.ok) map.set(BUILTIN_WALKER, walker.value)
    for (const t of traverserStore.traversers) {
      const c = compileProgram(t.text, predicateNames)
      if (c.ok) map.set(t.name, c.value)
    }
    return map
  }, [traverserStore.traversers, predicateNames])

  const defOptions = useMemo(() => [...defs.keys()], [defs])
  // Fall back to the first available definition if the chosen one was deleted/renamed.
  const effectiveDef = defs.has(placeDef) ? placeDef : defOptions[0] ?? BUILTIN_WALKER

  // The hand-authored base for an export: manual paint + registries only. A run's visits AND its A/B/C
  // registry writes are re-derived by re-running on the export grid — NOT baked in. Routed through the
  // shared authoredBoard so it's exactly what Stop restores: while a run is live (incl. auto-paused,
  // when the finished board still sits in the overlay) its registry writes are reverted to the pre-run
  // snapshot (registries have no per-tick stamp to strip, unlike visits); when stopped the overlay is
  // already the authored board. Also the board the Initial-state guards read.
  const exportBase = useMemo(
    () => authoredBoard(overlay, runLive !== null, authoredOverlayRef.current),
    [overlay, runLive],
  )

  // The Initial-state document, compiled + resolved against the CURRENT tiling into seed walkers +
  // registry/visited set-writes. Grid-relative, so it re-lays as the grid size changes and matches the
  // export (prepare.ts resolves the same document against the big grid). Referenced traversers are found
  // by number (t1, t2, … in list order) or name. Never stored in `seeds`/`overlay`, so canvas controls
  // can't remove them — you edit the document to change them.
  const initDoc = useMemo(
    () => compileDoc(initialStateStore.text, predicateNames),
    [initialStateStore.text, predicateNames],
  )
  const traverserOrder = useMemo(() => traverserStore.traversers.map((t) => t.name), [traverserStore.traversers])
  const initResolved = useMemo<InitResolved>(
    () =>
      initDoc.ok ? resolveInitialState(initDoc.value, tiling, traverserOrder, defs, exportBase, indexById) : EMPTY_INIT,
    [initDoc, tiling, traverserOrder, defs, exportBase, indexById],
  )
  const initSeeds = initResolved.seeds
  const initWrites = initResolved.writes

  // The overlay to DISPLAY + colour: while stopped, the hand-paint plus the Initial-state set-writes (so
  // authored registries/visited show); during a run the live overlay already contains them (baked in at
  // initRun), so use it directly.
  const displayOverlay = useMemo(
    () => (runLive ? overlay : applyInitWrites(overlay, initWrites)),
    [runLive, overlay, initWrites],
  )

  // The tiling's appearance: evaluate the coloring rules per tile, once per input change (not per
  // frame). Tiles with no matching rule are absent and keep the base fill.
  const colorFor = useMemo(
    () => colorize(coloringStore.rules, predicateText, tiling, displayOverlay, indexById),
    [coloringStore.rules, predicateText, tiling, displayOverlay, indexById],
  )

  // Tile id -> heading for the canvas to draw each walker's arrow (stats mode only). Show the live
  // run if one's in progress, else the authored seeds.
  const traverserHeads = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of runLive ?? seeds) m.set(t.tile, t.heading)
    return m
  }, [runLive, seeds])

  // Ghost heads for the Initial-state (rule-placed) walkers — only while stopped (during a run they're
  // merged into runLive and drawn solid). Skip any tile already carrying a hand seed (hand wins).
  const autoTraverserHeads = useMemo(() => {
    const m = new Map<string, number>()
    if (runLive === null) {
      const hand = new Set(seeds.map((s) => s.tile))
      for (const t of initSeeds) if (!hand.has(t.tile)) m.set(t.tile, t.heading)
    }
    return m
  }, [runLive, seeds, initSeeds])

  // The export currently open in the viewer (null = show the live canvas). Only a finished item is
  // viewable; a running/cap-evicted id resolves to null and the canvas comes back.
  const viewing = viewingId ? exports.find((x) => x.id === viewingId && x.status === 'done') ?? null : null

  // Keep at most this many exports in memory; older FINISHED ones are evicted (and their URLs revoked).
  const EXPORT_CAP = 12

  const revokeItem = (it: ExportItem) => {
    if (it.fullUrl) URL.revokeObjectURL(it.fullUrl)
    if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl)
  }

  // Start a background export job: it appears in the strip immediately as a running placeholder, runs
  // off the main thread, then flips to a finished thumbnail (and auto-downloads). Cancel via removeExport.
  const startExport = (params: ExportParams) => {
    const id = `ex${(exportSeq.current += 1)}`
    const { recipe } = params
    const filename = exportFilename(recipe.tilingId, recipe.gridW, recipe.gridH, recipe.output.width, recipe.output.height)
    const controller = new AbortController()
    jobControllers.current.set(id, controller)
    setExports((list) => {
      const next: ExportItem[] = [...list, { id, status: 'running', filename }]
      // Evict the oldest FINISHED item if we're over the cap (never drop a running job).
      while (next.length > EXPORT_CAP) {
        const idx = next.findIndex((x) => x.status === 'done')
        if (idx < 0) break
        revokeItem(next.splice(idx, 1)[0])
      }
      return next
    })

    generateExport(params, controller.signal)
      .then((outcome) => {
        jobControllers.current.delete(id)
        const fullUrl = URL.createObjectURL(outcome.full)
        const thumbUrl = URL.createObjectURL(outcome.thumb)
        downloadBlob(outcome.full, filename) // durable: blobs vanish on reload, the file doesn't
        setExports((list) =>
          list.map((x) =>
            x.id === id
              ? { ...x, status: 'done', fullUrl, thumbUrl, full: outcome.full, width: outcome.width, height: outcome.height, hitCap: outcome.hitCap, recipe }
              : x,
          ),
        )
      })
      .catch((e) => {
        jobControllers.current.delete(id)
        setExports((list) => list.filter((x) => x.id !== id)) // a cancelled or failed job drops out
        if (!isAbortError(e)) {
          setDropNote(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
          window.setTimeout(() => setDropNote(null), 4000)
        }
      })
  }

  // The strip's X: cancel a running job (terminates its worker; the catch removes it), or remove a
  // finished one (revoke its URLs).
  const removeExport = (id: string) => {
    const ctrl = jobControllers.current.get(id)
    if (ctrl) {
      ctrl.abort()
      return
    }
    setExports((list) => {
      const item = list.find((x) => x.id === id)
      if (item) revokeItem(item)
      return list.filter((x) => x.id !== id)
    })
    setViewingId((cur) => (cur === id ? null : cur))
  }

  // On unmount, abort any in-flight jobs and revoke every object URL so leaving the page doesn't leak.
  // We deliberately read the LATEST refs here (not a mount-time snapshot) — that's the whole point of a
  // teardown — so the exhaustive-deps "ref in cleanup" hint doesn't apply.
  const exportsRef = useRef(exports)
  exportsRef.current = exports
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const c of jobControllers.current.values()) c.abort()
      for (const it of exportsRef.current) revokeItem(it)
    }
  }, [])

  // ---- reopen a saved creation (gallery click / dropped PNG) ----
  // REPLACES the current canvas setup with the recipe's: tiling, grid, walkers, hand-paint, and the
  // predicate/traverser/coloring library. The recipe's (possibly huge) export grid is clamped to an
  // explorable size for editing — re-pick the big grid at export time. Walkers + paint are placed by
  // their portable centre-offsets (remap.ts), so they land analogously on this grid.
  const loadRecipe = (recipe: Recipe) => {
    setRunning(false)
    setRunLive(null)
    setStep(0)
    setSelectedIds([])
    setViewingId(null)
    clearDebug()
    const editGrid = Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round((recipe.gridW + recipe.gridH) / 2)))
    setTilingId(recipe.tilingId)
    setGridInput(editGrid)
    setGridN(editGrid)
    const t = buildTiling(recipe.tilingId, editGrid)
    setSeeds(remapSeeds(recipe.seeds, t))
    setOverlay(remapPaint(recipe.paint, t))
    predicateStore.setAll(recipe.predicates)
    traverserStore.setAll(recipe.traversers)
    coloringStore.setAll(recipe.coloringRules)
    initialStateStore.setAll(makeInitialState(recipe.initialState ?? ''))
    setFitNonce((n) => n + 1)
  }
  // A ref keeps the mount effect + drop handler calling the latest loadRecipe without re-subscribing.
  const loadRecipeRef = useRef(loadRecipe)
  loadRecipeRef.current = loadRecipe

  // On mount, apply a recipe handed off from the gallery ("open in canvas"). One-shot.
  useEffect(() => {
    const r = takePendingRecipe()
    if (r) loadRecipeRef.current(r)
  }, [])

  // Import a saved creation from its exported PNG — the real reopen-from-PNG path (the gallery uses
  // in-memory recipes). Two entry points share this: dropping an image on the canvas, and the
  // clickable "import" hint's file picker (the only way in on touch, where you can't drag a file).
  const showDropNote = (msg: string) => {
    setDropNote(msg)
    window.setTimeout(() => setDropNote(null), 4000)
  }
  const applyImport = (recipe: Recipe) => {
    loadRecipeRef.current(recipe)
    showDropNote(`Opened — ${recipe.tilingId}, grid ${recipe.gridW}×${recipe.gridH}`)
  }
  // Decode + validate/migrate the recipe embedded in an image, then either load it (blank panes) or
  // stash it for the "replace your work?" confirmation (panes already hold authored data).
  const importFromFile = async (file: File) => {
    let json: string | null
    try {
      json = decodeRecipeFromPng(new Uint8Array(await file.arrayBuffer()))
    } catch {
      return showDropNote('Could not read that file.')
    }
    if (!json) return showDropNote('No Exploroboros data in that image.')
    const res = parseRecipe(json)
    if (!res.ok) {
      return showDropNote(
        res.reason === 'too-new'
          ? 'Made with a newer version — update to open.'
          : 'That image’s data could not be read.',
      )
    }
    // "Is there user-authored work an import would destroy?" — mirrors the Reset button's blank check,
    // plus the authored predicate/coloring/traverser/initial-state libraries.
    const hasUserData =
      predicateStore.predicates.length > 0 ||
      traverserStore.traversers.length > 0 ||
      coloringStore.rules.length > 0 ||
      initialStateStore.text.trim().length > 0 ||
      seeds.length > 0 ||
      !overlayIsEmpty(overlay)
    if (hasUserData) setPendingImport(res.recipe)
    else applyImport(res.recipe)
  }
  const onCanvasDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      if (!dropActive) setDropActive(true)
    }
  }
  const onCanvasDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setDropActive(false)
  }
  const onCanvasDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDropActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) importFromFile(file)
  }

  // The clock. A reassigned ref keeps the interval calling the LATEST state each tick (the
  // copyRef/pasteRef pattern below), so listeners attach once yet never read stale state. The tick
  // itself is the pure stepTraversers; we auto-pause when every walker has died.
  // One tick of the live run. When the Inspect pane is open (`traceOn`) it records the tick's decision
  // trace into the history (and only then — plain stepTraversers is used otherwise, so a hidden log costs
  // nothing). Returns the surviving walkers (or null when not running). Shared by the clock and manual step.
  const advanceOneTick = (): Traverser[] | null => {
    if (runLive === null) return null
    const input = { tiling, overlay, traversers: runLive, step, defs, indexById }
    const result = traceOn ? stepTraversersTraced(input) : stepTraversers(input)
    if (traceOn) pushTrace((result as ReturnType<typeof stepTraversersTraced>).trace)
    setOverlay(result.overlay)
    setRunLive(result.traversers)
    setStep(result.step)
    return result.traversers
  }

  const tickRef = useRef<() => void>(() => {})
  tickRef.current = () => {
    const next = advanceOneTick()
    if (next && next.length === 0) setRunning(false) // every walker died -> auto-pause
  }
  useEffect(() => {
    if (!running) return
    if (speed === 'max') {
      // one tick per animation frame — as fast as the machine paints
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

  // Same for the drag-mode popup.
  useEffect(() => {
    if (!dragMenuOpen) return
    const onDown = (e: PointerEvent) => {
      if (dragMenuRef.current && !dragMenuRef.current.contains(e.target as Node)) setDragMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDragMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [dragMenuOpen])

  // Drag popup choices: a mode (off / select) or a paint target (which also switches to paint mode).
  const chooseDrag = (m: DragMode) => {
    setDragMode(m)
    setDragMenuOpen(false)
  }
  const choosePaint = (t: PaintTarget) => {
    setPaintTarget(t)
    setDragMode('paint')
    setDragMenuOpen(false)
  }

  // A single-tile selection drives the full Inspect view; a multi-tile box drives the bulk view.
  const selected = selectedIds.length === 1 ? nodeById(tiling, selectedIds[0]) ?? null : null
  // Walkers to show + inspect: the live run if one's in progress, else the authored seeds. Authoring
  // (place/remove/aim) is only allowed while stopped (`runLive === null`).
  const walkers = runLive ?? seeds
  const stopped = runLive === null
  // Something to run: a paused/playing run, hand-placed seeds, or grid-relative Initial-state walkers.
  const hasWalkers = runLive !== null || seeds.length > 0 || initSeeds.length > 0
  const selectedTraverser = selected ? walkers.find((t) => t.tile === selected.id) ?? null : null
  // An Initial-state (rule-placed) walker on the selected tile (only while stopped — during a run it's
  // part of runLive, found via selectedTraverser). Drives a read-only "placed by a rule" note in Inspect.
  const selectedAuto = selected && stopped ? initSeeds.find((t) => t.tile === selected.id) ?? null : null

  // ---- traverser run controls ----
  // Start a fresh run from the authored seeds on a COPY (so the seeds stay intact for Stop to
  // restore): refresh each walker's settings/registers from its current definition (so editing a def
  // before Play takes effect), then mark each starting tile visited at step 0.
  const initRun = () => {
    clearDebug() // a fresh run starts a fresh log
    authoredOverlayRef.current = overlay // snapshot the authored board so Stop can revert run registry writes
    // Hand-placed seeds + the grid-relative Initial-state walkers (hand wins a shared tile). Same merge
    // as the export path (prepare.ts) so the preview grows exactly what an export would.
    const start = mergeByTile(seeds, initSeeds)
    const live = start.map((s) => {
      const set = defs.get(s.def)?.settings ?? DEFAULT_SETTINGS
      return { ...s, steps: 0, splits: 0, p: 0, q: 0, r: 0, maxSplit: set.maxSplit, maxSteps: set.maxSteps, movement: set.movement }
    })
    setRunLive(live)
    setStep(0)
    // Start the run overlay from the hand-paint PLUS the Initial-state set-writes (registries/visited),
    // then stamp step-0 visits on the starting tiles.
    setOverlay((prev) => addVisits(applyInitWrites(prev, initWrites), live.map((t) => t.tile), 0))
  }
  const play = () => {
    if (!hasWalkers) return
    if (runLive === null) initRun()
    setRunning(true)
  }
  const pause = () => setRunning(false)
  // The Play/Pause slot is one toggling button: running → pause; otherwise → play (resuming from where
  // a pause left off, or starting a fresh run from the seeds).
  const togglePlay = () => (running ? pause() : play())
  // Stop: discard the live run and restore the AUTHORED board — clear the run's visit trail (step >= 0)
  // AND revert any registry (A/B/C) writes the run made back to their pre-run values (the initRun
  // snapshot), so only hand-made state remains (step -1 visits + hand-set registries) and the placed
  // walkers (seeds) reappear. Only Reset removes the seeds.
  const stopRun = () => {
    setRunning(false)
    setRunLive(null)
    setStep(0)
    setOverlay((prev) => authoredBoard(prev, true, authoredOverlayRef.current))
    clearDebug()
  }
  // Full Reset: wipe everything (painting + placed walkers) and end any run.
  const resetAll = () => {
    setRunning(false)
    setRunLive(null)
    setSeeds([])
    setStep(0)
    setOverlay(new Map())
    clearDebug()
  }

  // The Step button: advance exactly one tick, pausing a running sim first (so Step always drops you
  // into manual stepping). The first Step on a stopped run just initializes it — places + marks the
  // seeds, like Play's first beat; each later Step advances one tick. (advanceOneTick reads runLive
  // directly, not `running`, so pausing in the same click doesn't skip this tick.)
  const stepOnce = () => {
    if (running) setRunning(false)
    if (runLive === null) {
      if (seeds.length === 0 && initSeeds.length === 0) return
      initRun()
      return
    }
    advanceOneTick()
  }

  // Authoring the initial state (only while stopped): place / remove / aim walkers. These edit
  // `seeds`, the savable starting position — never the live run. Placement records no visit; the
  // walk records visits once it runs.
  // Build a seed walker for a tile from the chosen definition: heading is an edge NUMBER — the def's
  // header value if it sets one (wrapped to the tile's edge count), else edge 0 (the north edge).
  // Counters/registers start at zero; the settings snapshot the def (refreshed at Play so a later edit
  // to the def takes effect).
  const makeSeed = (tile: string): Traverser => {
    const set = defs.get(effectiveDef)?.settings ?? DEFAULT_SETTINGS
    const n = nodeById(tiling, tile)?.sides.length ?? 0
    const heading = set.heading !== undefined && n > 0 ? (((Math.round(set.heading) % n) + n) % n) : 0
    return {
      id: `tr${(traverserSeq.current += 1)}`,
      tile,
      heading,
      def: effectiveDef,
      steps: 0,
      splits: 0,
      maxSplit: set.maxSplit,
      maxSteps: set.maxSteps,
      movement: set.movement,
      p: 0,
      q: 0,
      r: 0,
    }
  }
  const placeTraverser = (id: string) => {
    if (seeds.some((t) => t.tile === id)) return
    setSeeds((list) => [...list, makeSeed(id)])
  }
  const removeTraverser = (id: string) => setSeeds((list) => list.filter((t) => t.tile !== id))
  const rotateTraverser = (id: string, dir: 1 | -1) =>
    setSeeds((list) =>
      list.map((t) => (t.tile === id ? { ...t, heading: rotateHeading(tiling, id, t.heading, dir) } : t)),
    )

  // ---- bulk edits over a box-selected set (the multi-tile Inspect view) ----
  const placeTraversersMany = (ids: ReadonlyArray<string>) =>
    setSeeds((list) => {
      const have = new Set(list.map((t) => t.tile))
      const adds: Traverser[] = []
      for (const id of ids) {
        if (have.has(id)) continue
        have.add(id)
        adds.push(makeSeed(id))
      }
      return adds.length ? [...list, ...adds] : list
    })
  const removeTraversersMany = (ids: ReadonlyArray<string>) => {
    const set = new Set(ids)
    setSeeds((list) => list.filter((t) => !set.has(t.tile)))
  }
  const rotateTraversersMany = (ids: ReadonlyArray<string>, dir: 1 | -1) => {
    const set = new Set(ids)
    setSeeds((list) => list.map((t) => (set.has(t.tile) ? { ...t, heading: rotateHeading(tiling, t.tile, t.heading, dir) } : t)))
  }
  const bumpVisitMany = (ids: ReadonlyArray<string>, delta: number) =>
    setOverlay((prev) => {
      if (delta >= 0) return addVisits(prev, ids, MANUAL_STEP)
      let next = prev
      for (const id of ids) next = removeManualVisit(next, id)
      return next
    })
  const bumpRegMany = (ids: ReadonlyArray<string>, reg: Registry, delta: number) =>
    setOverlay((prev) => {
      let next = prev
      for (const id of ids) next = bumpRegistry(next, id, reg, delta)
      return next
    })

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
      setSelectedIds([])
      // Walkers are keyed by tile id, meaningless on another tiling — end the run + drop the seeds.
      setRunning(false)
      setRunLive(null)
      setSeeds([])
      setStep(0)
      clearDebug()
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

  // Canvas controls (run + tools). Rendered in a stable top bar ABOVE all panes, so they keep their
  // place when a pane opens or closes — instead of riding the canvas pane's changing width.
  const canvasControls = (
    <>
      <div className="transport seg-shell" role="group" aria-label="traverser run">
        <button type="button" className="seg-item seg-item--btn transport-btn" onClick={togglePlay} disabled={!running && !hasWalkers} aria-label={running ? 'Pause — stop ticking, keep the walkers' : 'Play — run the traversers'} title={running ? 'Pause — stop ticking, keep the walkers' : 'Play — run the traversers'}>{running ? '❚❚' : '▶'}</button>
        <button type="button" className="seg-item seg-item--btn transport-btn" onClick={stepOnce} disabled={!hasWalkers} aria-label="Step — advance one tick (pauses if playing)" title="Step — advance one tick (pauses if playing)">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6 5 L15 12 L6 19 Z" /><rect x="16" y="5" width="2.4" height="14" rx="1" /></svg>
        </button>
        <button type="button" className="seg-item seg-item--btn transport-btn" onClick={stopRun} disabled={!running && runLive === null && !hasTraverserVisits(overlay)} aria-label="Stop — end the run and clear its trail (keeps the walkers and your painting)" title="Stop — end the run and clear its trail (keeps the walkers and your painting)">■</button>
      </div>
      <SpeedBar value={speed} onChange={setSpeed} ariaLabel="traverser speed" />
      <div className="canvas-tools">
        <TilingPicker value={tilingId} onChange={selectTiling} />
        <div className="canvas-drag" ref={dragMenuRef}>
          <button type="button" className="canvas-trigger" aria-label="drag mode" aria-haspopup="menu" aria-expanded={dragMenuOpen} title="What a one-finger drag does" onClick={() => setDragMenuOpen((o) => !o)}>
            {dragMode === 'paint' ? `paint: ${paintLabel(paintTarget)}` : dragMode === 'select' ? 'drag: box select' : dragMode === 'paintselect' ? 'drag: paint select' : 'drag: off'}
            <span className="canvas-trigger-caret" aria-hidden="true">▾</span>
          </button>
          {dragMenuOpen && (
            <div className="drag-menu" role="menu">
              <button type="button" role="menuitem" className="drag-item" aria-current={dragMode === 'off'} onClick={() => chooseDrag('off')}>off</button>
              <button type="button" role="menuitem" className="drag-item" aria-current={dragMode === 'select'} onClick={() => chooseDrag('select')}>box select</button>
              <button type="button" role="menuitem" className="drag-item" aria-current={dragMode === 'paintselect'} onClick={() => chooseDrag('paintselect')}>paint select</button>
              <div className="drag-menu-label">Paint</div>
              {PAINT_TARGETS.map((t) => (
                <button type="button" role="menuitem" key={t.key} className="drag-item drag-item--indent" aria-current={dragMode === 'paint' && paintTarget === t.key} onClick={() => choosePaint(t.key)}>{t.label}</button>
              ))}
            </div>
          )}
        </div>
        <SegmentedControl
          ariaLabel="tile display"
          value={displayMode}
          onChange={setDisplayMode}
          options={[
            { value: 'edges', label: 'edges', title: 'tile edges drawn' },
            { value: 'none', label: 'none', title: 'flush fills, no edges' },
            { value: 'stats', label: 'stats', title: 'numbers + heading arrows inside tiles' },
          ]}
        />
        <div className="canvas-more-wrap" ref={moreRef}>
          <button type="button" className="canvas-btn canvas-more" onClick={() => setToolsOpen((o) => !o)} aria-label="more controls" aria-expanded={toolsOpen} title="More controls">⋯</button>
          <div className={`canvas-extra${toolsOpen ? ' is-open' : ''}`}>
            <label className="canvas-grid" title={runLive !== null ? 'Stop the run to resize the grid' : 'Grid size — tiles = N × N'}>
              <span className="canvas-grid-label">{gridInput}×{gridInput}</span>
              <input type="range" min={GRID_MIN} max={GRID_MAX} step={10} value={gridInput} aria-label="grid size" disabled={runLive !== null} onChange={(e) => setGridInput(Number(e.target.value))} />
            </label>
            <button type="button" className="canvas-btn" onClick={() => setFitNonce((n) => n + 1)}>Fit</button>
            <button type="button" className="canvas-btn" onClick={resetAll} disabled={overlayIsEmpty(overlay) && seeds.length === 0 && runLive === null} title="Reset — clears every visit and counter, and removes the walkers">Reset</button>
          </div>
        </div>
        <ExportMenu
          tilingId={tilingId}
          tiling={tiling}
          liveGridN={gridN}
          seeds={seeds}
          baseOverlay={exportBase}
          predicates={predicateStore.predicates}
          traversers={traverserStore.traversers}
          coloringRules={coloringStore.rules}
          initialState={initialStateStore.text}
          onStartExport={startExport}
        />
      </div>
    </>
  )

  return (
    <div className="canvas-shell">
      <div className="canvas-controls" role="toolbar" aria-label="Canvas controls">
        {canvasControls}
      </div>
      <div className="workspace">
      <Panel
        title="Traversers"
        side="left"
        wide
        fill
        collapsed={leftOpen !== 'traversers'}
        onCollapsedChange={() => toggleLeft('traversers')}
      >
        <TraversersPane
          store={traverserStore}
          predicateNames={predicateNames}
          onOpenPredicates={() => setPredsOpen(true)}
        />
      </Panel>

      <Panel
        title="Coloring"
        side="left"
        wide
        fill
        collapsed={leftOpen !== 'coloring'}
        onCollapsedChange={() => toggleLeft('coloring')}
      >
        <ColoringPane
          store={coloringStore}
          customPredicates={predicateStore.predicates}
          onOpenPredicates={() => setPredsOpen(true)}
        />
      </Panel>

      <div className="canvas-pane">
        <div className="canvas-stage" onDragOver={onCanvasDragOver} onDragLeave={onCanvasDragLeave} onDrop={onCanvasDrop}>
          {viewing && viewing.fullUrl ? (
            <ImageViewer src={viewing.fullUrl} />
          ) : (
            <TilingCanvas
              tiling={tiling}
              displayMode={displayMode}
              dragMode={dragMode}
              selectedIds={selectedIds}
              overlay={displayOverlay}
              colorFor={colorFor}
              traverserHeads={traverserHeads}
              autoTraverserHeads={autoTraverserHeads}
              highlightGroups={traceOn ? highlightGroups : undefined}
              tileNumber={(id) => indexById.get(id) ?? -1}
              onSelect={(id) => setSelectedIds([id])}
              onSelectTiles={setSelectedIds}
              onDeselect={() => setSelectedIds((cur) => (cur.length ? [] : cur))}
              onPaint={paint}
              fitSignal={fitNonce}
            />
          )}
          <ExportStrip
            items={exports}
            viewingId={viewingId}
            onView={setViewingId}
            onReturn={() => setViewingId(null)}
            onDownload={(item) => { if (item.full) downloadBlob(item.full, item.filename) }}
            onRemove={removeExport}
          />
          {/* Big, obvious share button while viewing an exported image — the primary way into the
              gallery. Sits where the FPS/tile HUD normally is (hidden in the image viewer). */}
          {viewing && viewing.fullUrl && viewing.recipe && (
            <button
              type="button"
              className="btn btn-primary canvas-share-cta"
              onClick={() => setUploadItem(viewing)}
              title="Share this creation to the community gallery"
            >
              ⤴ Share to the gallery
            </button>
          )}
          {uploadItem && uploadItem.full && uploadItem.recipe && (
            <UploadDialog
              recipe={uploadItem.recipe}
              image={uploadItem.full}
              previewUrl={uploadItem.thumbUrl}
              onClose={() => setUploadItem(null)}
              onUploaded={() => {
                setDropNote('Shared to the gallery!')
                window.setTimeout(() => setDropNote(null), 4000)
              }}
            />
          )}
          {dropActive && (
            <div className="canvas-drop-overlay">
              <strong>Drop to import</strong>
              <span>We’ll read this image’s metadata and rebuild its tiling, rules, and pattern here.</span>
            </div>
          )}
          {dropNote && <div className="canvas-drop-note">{dropNote}</div>}
          {/* Always-present affordance for the hidden reopen-from-PNG feature: drop a saved image here,
              or click to pick one (the only import path on touch). Shown whenever the live canvas is up
              (hidden only while the image viewer has replaced it); pins to the very bottom-left, under
              the tile/FPS HUD. */}
          {!(viewing && viewing.fullUrl) && (
            <button
              type="button"
              className="canvas-import-hint"
              onClick={() => fileInputRef.current?.click()}
              title="Drop an exported PNG here, or click to choose a file"
            >
              drag an image here to import
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png"
            className="visually-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importFromFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      {pendingImport && (
        <ConfirmDialog
          title="Replace your current work?"
          message="Importing this image rebuilds the tiling, walkers, painting, and all predicate, coloring, traverser, and initial-state rules from its metadata. Your current panes will be replaced — this can’t be undone."
          confirmLabel="Replace"
          cancelLabel="Keep my work"
          danger
          onConfirm={() => {
            applyImport(pendingImport)
            setPendingImport(null)
          }}
          onCancel={() => setPendingImport(null)}
        />
      )}

      <Panel
        title="Inspect"
        side="right"
        wide
        collapsed={rightOpen !== 'inspect'}
        onCollapsedChange={() => toggleRight('inspect')}
      >
        {selected ? (
          <InspectContent
            tiling={tiling}
            node={selected}
            number={indexById.get(selected.id) ?? -1}
            overlay={overlay}
            clip={clip}
            traverserHeading={selectedTraverser ? selectedTraverser.heading : selectedAuto ? selectedAuto.heading : null}
            traverserIsAuto={selectedTraverser === null && selectedAuto !== null}
            canEditTraverser={stopped}
            defOptions={defOptions}
            placeDef={effectiveDef}
            onChangeDef={setPlaceDef}
            onVisit={bumpVisit}
            onRegistry={bumpReg}
            onCopy={copyTile}
            onPaste={pasteTile}
            onPlaceTraverser={placeTraverser}
            onRemoveTraverser={removeTraverser}
            onRotateTraverser={rotateTraverser}
          />
        ) : selectedIds.length > 1 ? (
          <MultiInspectContent
            count={selectedIds.length}
            canEditTraverser={stopped}
            defOptions={defOptions}
            placeDef={effectiveDef}
            onChangeDef={setPlaceDef}
            onPlaceTraverser={() => placeTraversersMany(selectedIds)}
            onRemoveTraverser={() => removeTraversersMany(selectedIds)}
            onRotateTraverser={(dir) => rotateTraversersMany(selectedIds, dir)}
            onVisit={(delta) => bumpVisitMany(selectedIds, delta)}
            onRegistry={(reg, delta) => bumpRegMany(selectedIds, reg, delta)}
          />
        ) : (
          <p className="pane-hint">Click a tile to inspect it — or switch drag to “select” and box a group.</p>
        )}

        <section className="inspect-log">
          <h3 className="inspect-log-head">Traverser log</h3>
          <DebugPane
            history={traceHistory}
            viewedStep={viewedStep}
            onViewStep={setViewedStep}
            tileNumber={(id) => indexById.get(id) ?? -1}
            onHover={setHoveredHighlight}
            pinnedKey={pinned?.key ?? null}
            onPinToggle={(key, groups) => setPinned((cur) => (cur?.key === key ? null : { key, groups }))}
          />
        </section>
      </Panel>

      <Panel
        title="Initial state"
        side="right"
        wide
        fill
        collapsed={rightOpen !== 'initial'}
        onCollapsedChange={() => toggleRight('initial')}
      >
        <InitialStatePane
          store={initialStateStore}
          predicateNames={predicateNames}
          traverserNames={traverserOrder}
          onOpenPredicates={() => setPredsOpen(true)}
        />
      </Panel>

      {predsOpen && (
        <CustomPredicatesDialog
          store={predicateStore}
          traverserNames={traverserOrder}
          onClose={() => setPredsOpen(false)}
        />
      )}
      </div>
    </div>
  )
}

// The definition picker shown before a Place button — which traverser definition to instantiate.
function DefSelect({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<string>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <select className="seg-item trav-def" aria-label="traverser to place" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function InspectContent({
  tiling,
  node,
  number,
  overlay,
  clip,
  traverserHeading,
  traverserIsAuto,
  canEditTraverser,
  defOptions,
  placeDef,
  onChangeDef,
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
  // The heading (edge number) of the walker on this tile, or null if there isn't one here.
  traverserHeading: number | null
  // True when that walker came from an auto-place rule — shown read-only (change it by editing the rule).
  traverserIsAuto: boolean
  // Whether placements can be edited — only while stopped (a run owns the walkers).
  canEditTraverser: boolean
  // Which definition placement instantiates (the picker), and the available names.
  defOptions: ReadonlyArray<string>
  placeDef: string
  onChangeDef: (name: string) => void
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
  // Mirror the DSL attributes exactly so the readout matches what a predicate sees:
  // visited-edges = adjacent edges whose neighbour is visited (a two-edge neighbour counts twice);
  // visited-neighbors = distinct adjacent tiles visited. Identical on the edge-to-edge square tiling.
  const visitedEdges = neighborEdges(tiling, node.id).filter(
    (e) => visitCount(tileState(overlay, e.tile)) > 0,
  ).length
  const visitedNeighbors = uniqueNeighbors(tiling, node.id).filter(
    (id) => visitCount(tileState(overlay, id)) > 0,
  ).length

  // Shapes with a hand-crafted straight-through pairing (the wedge) get dotted lines in the mini
  // linking each opposite-edge pair (deduped to one line per pair).
  const shapeDef = tiling.shapes[node.shape]
  const straightPairs: Array<[number, number]> | undefined = shapeDef?.straightThroughOpposite
    ? shapeDef.oppositeSides
        .map((opp, k) => [Math.min(k, opp[0]), Math.max(k, opp[0])] as [number, number])
        .filter(([a, b], i, arr) => arr.findIndex((p) => p[0] === a && p[1] === b) === i)
    : undefined

  return (
    <div className="tile-stats">
      <TileMini node={node} heading={traverserHeading} straightPairs={straightPairs} />
      {node.shape === 'wedge' ? (
        <p className="straightness">
          <strong>Straightness:</strong> the dotted lines link the wedge’s hand-crafted opposite edges —
          going <em>straight</em> enters one edge and leaves by the edge it’s linked to.
        </p>
      ) : node.shape === 'triangle' ? (
        <p className="straightness">
          <strong>Straightness:</strong> right-handed — a triangle has no edge directly opposite, so going{' '}
          <em>straight</em> takes the right-hand (clockwise) of the two forward edges.
        </p>
      ) : null}
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
        ) : traverserIsAuto ? (
          <div className="trav-auto">
            <div className="trav-controls seg-shell">
              <span className="seg-item trav-arrow">
                <HeadingArrow node={node} heading={traverserHeading ?? 0} />
              </span>
            </div>
            <p className="trav-note">Placed by an Initial-state rule — edit it in the Initial state pane to change it.</p>
          </div>
        ) : traverserHeading === null ? (
          <div className="trav-place-row seg-shell">
            <DefSelect options={defOptions} value={placeDef} onChange={onChangeDef} />
            <button type="button" className="seg-item seg-item--btn trav-place" onClick={() => onPlaceTraverser(node.id)}>
              Place
            </button>
          </div>
        ) : (
          <div className="trav-controls seg-shell">
            <button
              type="button"
              className="seg-item seg-item--btn trav-rot"
              onClick={() => onRotateTraverser(node.id, -1)}
              aria-label="rotate heading left"
            >
              ↺
            </button>
            <span className="seg-item trav-arrow">
              <HeadingArrow node={node} heading={traverserHeading} />
            </span>
            <button
              type="button"
              className="seg-item seg-item--btn trav-rot"
              onClick={() => onRotateTraverser(node.id, 1)}
              aria-label="rotate heading right"
            >
              ↻
            </button>
            <button type="button" className="seg-item seg-item--btn trav-remove" onClick={() => onRemoveTraverser(node.id)}>
              Remove
            </button>
          </div>
        )}
      </div>

      <dl>
        <dt>tile type</dt>
        <dd className="tile-type-value">{node.shape}</dd>
        <dt title="which rotational variant of its shape this tile is — the same index on any tiling, so traversers route on this rather than the per-tiling coordinates">orientation</dt>
        <dd>{tileOrientation(tiling, node.id)}</dd>
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
        <dd>
          <Stepper value={own} onStep={(d) => onVisit(node.id, d)} label="visited" min={0} valueClassName="visited-value" />
        </dd>
        <dt>steps</dt>
        <dd className="steps-readout">{formatSteps(st.visits)}</dd>
        <dt title="distinct adjacent tiles that are visited (the Rule-90 count)">visited-neighbors</dt>
        <dd>{visitedNeighbors}</dd>
        <dt title="adjacent edges whose neighbour is visited (a two-edge neighbour counts twice)">visited-edges</dt>
        <dd>{visitedEdges}</dd>
      </dl>

      <div className="clip-actions">
        <button type="button" className="clip-btn" onClick={onCopy} aria-label="copy tile attributes">
          Copy
        </button>
        <button
          type="button"
          className="clip-btn"
          onClick={onPaste}
          disabled={!canPaste(clip, node.shape)}
          aria-label="paste tile attributes"
        >
          Paste
        </button>
      </div>

      <details className="adv-section">
        <summary>advanced</summary>
        <div className="adv-reg-head">
          <span className="adv-reg-title">registries</span>
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
        </div>
        <dl>
          {REGISTRIES.map(({ key, label }) => (
            <Fragment key={key}>
              <dt>{label}</dt>
              <dd>
                <Stepper
                  value={st[key]}
                  onStep={(d) => onRegistry(node.id, key, d)}
                  label={label}
                  min={0}
                  valueClassName={`reg-value reg-${key}`}
                />
              </dd>
            </Fragment>
          ))}
        </dl>
      </details>
    </div>
  )
}

// The Inspect view for a box-selected group: no per-tile stats (they differ), just the edit
// controls applied to every selected tile at once — place/aim/remove walkers, and the visit /
// registry steppers.
function MultiInspectContent({
  count,
  canEditTraverser,
  defOptions,
  placeDef,
  onChangeDef,
  onPlaceTraverser,
  onRemoveTraverser,
  onRotateTraverser,
  onVisit,
  onRegistry,
}: {
  count: number
  canEditTraverser: boolean
  defOptions: ReadonlyArray<string>
  placeDef: string
  onChangeDef: (name: string) => void
  onPlaceTraverser: () => void
  onRemoveTraverser: () => void
  onRotateTraverser: (dir: 1 | -1) => void
  onVisit: (delta: number) => void
  onRegistry: (reg: Registry, delta: number) => void
}) {
  return (
    <div className="tile-stats">
      <h3 className="stat-head">{count} tiles selected</h3>
      <p className="pane-hint">Edits apply to all selected tiles.</p>

      <div className="tile-traverser">
        <div className="trav-head">
          <span className="trav-title">traverser</span>
        </div>
        {!canEditTraverser ? (
          <p className="trav-note">Stop the run to edit the walkers.</p>
        ) : (
          <div className="trav-controls trav-controls--multi">
            <div className="trav-place-row seg-shell">
              <DefSelect options={defOptions} value={placeDef} onChange={onChangeDef} />
              <button type="button" className="seg-item seg-item--btn trav-place" onClick={onPlaceTraverser}>
                Place on all
              </button>
            </div>
            <div className="seg-shell">
              <button type="button" className="seg-item seg-item--btn trav-rot" onClick={() => onRotateTraverser(-1)} aria-label="rotate all headings left">
                ↺
              </button>
              <button type="button" className="seg-item seg-item--btn trav-rot" onClick={() => onRotateTraverser(1)} aria-label="rotate all headings right">
                ↻
              </button>
              <button type="button" className="seg-item seg-item--btn trav-remove" onClick={onRemoveTraverser}>
                Remove all
              </button>
            </div>
          </div>
        )}
      </div>

      <dl>
        <dt>visited</dt>
        <dd>
          <Stepper value={0} display="—" onStep={onVisit} label="visited on all" valueClassName="visited-value" />
        </dd>
      </dl>

      <details className="adv-section">
        <summary>advanced</summary>
        <div className="adv-reg-head">
          <span className="adv-reg-title">registries</span>
        </div>
        <dl>
          {REGISTRIES.map(({ key, label }) => (
            <Fragment key={key}>
              <dt>{label}</dt>
              <dd>
                <Stepper
                  value={0}
                  display="—"
                  onStep={(d) => onRegistry(key, d)}
                  label={`${label} on all`}
                  valueClassName={`reg-value reg-${key}`}
                />
              </dd>
            </Fragment>
          ))}
        </dl>
      </details>
    </div>
  )
}

// A small arrow showing a walker's heading — points at the heading EDGE (headingArrowDir), matching
// the canvas head + the Inspect tile mini. Heading is an edge number; the SVG arrow points east by
// default, so rotate it to the edge direction (world y-up → screen y-down negates y).
function HeadingArrow({ node, heading }: { node: TileNode; heading: number }) {
  const dir = headingArrowDir(node, heading)
  const deg = (Math.atan2(-dir.y, dir.x) * 180) / Math.PI
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
