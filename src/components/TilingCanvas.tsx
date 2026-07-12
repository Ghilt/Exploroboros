import './TilingCanvas.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Shape } from 'react-konva'
import Konva from 'konva'
import type { Tiling, Vec2 } from '../tiling'
import { nodeById, scaleAround, headingArrowDir } from '../tiling'
import {
  fitToView,
  worldToScreen,
  screenToWorld,
  zoomAt,
  panBy,
  clampView,
  reframeView,
  pickTile,
  tilesInRect,
  tilesAlongSegment,
  representativeTileSize,
  tileState,
  visitCount,
  flattenColor,
  inflatePolygon,
  FLUSH_OVERLAP_PX,
} from '../canvas'
import type { View, Size, TileState } from '../canvas'

// The interactive Konva plane (CLAUDE.md §4.1 — resolved: Konva). All tiles draw in ONE
// Konva.Shape via a custom sceneFunc — one canvas pass, culled to the viewport, so it scales to
// many thousands of tiles. World<->screen mapping and hit-testing share the pure helpers in
// src/canvas so draw and pick can never drift. Wheel/drag/pinch pan+zoom, tap-to-select, and
// drag-to-paint are wired here; the heavy logic lives in those tested pure modules.

if (typeof window !== 'undefined') {
  // Crisp on HiDPI without an oversized backing store on 3x phones.
  Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
}

const HIGHLIGHT_SCALE = 1.2 // matches the SVG selection overlay
// Stats labels need at least this many screen px to be worth drawing; below it they'd be an
// unreadable smear (and slow at 10k+ tiles), so on very large grids you zoom in to reveal them.
const MIN_LABEL_PX = 3
// ...and stop growing past this many screen px. Labels track the zoom (so they appear as you zoom
// in) up to a comfortable reading size, then hold steady while the tile keeps growing around them —
// so the deeper you zoom, the more room the number has to breathe instead of swelling to fill the tile.
const MAX_LABEL_PX = 15

type Palette = {
  tile: string
  edge: string
  num: string
  visited: string
  accent: string
  accentStrong: string
  accent2: string
  accent3: string
  traverser: string
  // A ghostly, half-transparent head for rule-placed (Initial-state) walkers — reads as "placed by a
  // rule, not by hand".
  traverserAuto: string
  mono: string
}

// White tiles / black edges match the SVG debug view exactly (it hardcodes them, light + dark);
// accent colours are themed, read from CSS custom properties at runtime.
const FALLBACK: Palette = {
  tile: '#fff',
  edge: '#000',
  num: '#333',
  visited: '#c9551c',
  accent: '#e2682a',
  accentStrong: '#c9551c',
  accent2: '#c0398e',
  accent3: '#6d2b8f',
  // Traverser arrow — solid black (tiles are always white), so the head reads as "the walker" in
  // every display mode.
  traverser: '#000',
  traverserAuto: 'rgba(0, 0, 0, 0.32)',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

// Reused empty overlay so drawTiles can treat "no overlay" uniformly without per-frame allocation.
const NO_OVERLAY: ReadonlyMap<string, TileState> = new Map()

// How tiles are drawn: edges (black outline), none (fills only, no outline), or stats (outline +
// tile number + visited count printed inside). Cycled by the display chip.
export type DisplayMode = 'edges' | 'none' | 'stats'

// What a one-pointer drag does: paint the current target, box-select tiles, freehand "paint" a
// selection by dragging over tiles, or nothing (so a touch drag scrolls the mobile page). Tap
// always inspects; two-finger / wheel always pan+zoom.
export type DragMode = 'paint' | 'select' | 'paintselect' | 'off'

const NO_SELECTION: ReadonlyArray<string> = []

// Debug highlighting (the decision-log hover): tiles to outline, grouped by their ROLE in a
// traverser's decision so each draws in a distinct colour. Plain data (no Konva) so the mapper that
// builds it stays pure + testable. See src/debug/highlights.ts and drawHighlights below.
//  - current:   the tile the walker is on now
//  - decorator: the tile a guard's `. edge`/`. tile`/`. target` decoration read (a pointer target)
//  - candidate: a destination still under consideration
//  - chosen:    a destination that survived (a move/split target)
//  - rejected:  a candidate that was rejected
export type HighlightRole = 'current' | 'decorator' | 'candidate' | 'chosen' | 'rejected' | 'write'
export type HighlightGroups = ReadonlyArray<{ role: HighlightRole; ids: ReadonlyArray<string> }>

type Props = {
  tiling: Tiling
  displayMode?: DisplayMode
  dragMode?: DragMode
  selectedIds?: ReadonlyArray<string>
  overlay?: ReadonlyMap<string, TileState>
  // Precomputed fill per tile id (CSS colour), from the coloring rules. Tiles absent here keep the
  // base fill. Computed by the colorizer in Workspace, not per frame.
  colorFor?: ReadonlyMap<string, string>
  // Tile id -> heading (an edge NUMBER) for each hand-placed / running walker, drawn as a solid arrow
  // (any display mode) — and a tile with a head shows ONLY the arrow, no printed labels.
  traverserHeads?: ReadonlyMap<string, number>
  // Same, for rule-placed walkers (from the Initial-state pane) — drawn ghostly so they read as
  // rule-placed, not hand-placed.
  autoTraverserHeads?: ReadonlyMap<string, number>
  // Debug overlay: tiles to outline by role (decision-log hover). Undefined / empty = nothing drawn.
  highlightGroups?: HighlightGroups
  // Path preview: ordered tile walks to draw as pulsating polylines through centroids, the FINAL tile of
  // each outlined, in that path's per-source-line colour (shared with the editor swatches). From selecting
  // text in the Traversers editor. Undefined / empty = nothing drawn.
  pathPreview?: ReadonlyArray<{ tiles: ReadonlyArray<string>; color: string }>
  tileNumber?: (id: string) => number
  onSelect?: (id: string) => void
  onSelectTiles?: (ids: string[]) => void
  // Called when a non-selecting gesture (pan / zoom / paint / empty tap) happens, so the workspace
  // can drop the current selection.
  onDeselect?: () => void
  onPaint?: (ids: ReadonlyArray<string>) => void
  // Bumping this counter (e.g. a Fit button) re-frames the whole tiling.
  fitSignal?: number
}

export function TilingCanvas({
  tiling,
  displayMode = 'edges',
  dragMode = 'paint',
  selectedIds = NO_SELECTION,
  overlay,
  colorFor,
  traverserHeads,
  autoTraverserHeads,
  highlightGroups,
  pathPreview,
  tileNumber,
  onSelect,
  onSelectTiles,
  onDeselect,
  onPaint,
  fitSignal,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  const tilesLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef = useRef<Konva.Layer>(null)
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 })
  const paletteRef = useRef<Palette>(FALLBACK)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // Mirror props the imperative pointer/wheel handlers need, so listeners attach once yet
  // always read current values. `userMoved` stops auto-fit re-framing after the user pans/zooms.
  const tilingRef = useRef(tiling)
  tilingRef.current = tiling
  const sizeRef = useRef(size)
  sizeRef.current = size
  const userMovedRef = useRef(false)
  // Keeps a freshly single-selected tile centred as the canvas resizes around it (e.g. the Inspect
  // pane opening narrows the canvas right under the tile you just tapped) — see the re-frame effect
  // below. Cleared by a manual pan/zoom/pinch (apply()) so it never fights deliberate navigation.
  const lastFocusIdRef = useRef<string | null>(null)
  const suppressFollowRef = useRef(false)
  const focusAnimRef = useRef(0)
  const marqueeRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onSelectTilesRef = useRef(onSelectTiles)
  onSelectTilesRef.current = onSelectTiles
  const onDeselectRef = useRef(onDeselect)
  onDeselectRef.current = onDeselect
  const onPaintRef = useRef(onPaint)
  onPaintRef.current = onPaint
  // Ephemeral outline on the tiles of the current/just-finished paint stroke; alpha fades to 0 after
  // release. Canvas-local visual feedback only — never touches the overlay.
  const paintFlashRef = useRef<{ ids: Set<string>; alpha: number } | null>(null)
  const fadeRafRef = useRef(0)
  // Pulse phase (0..1) for the debug highlight overlay, driven by a rAF while a log row is hovered.
  const pulseRef = useRef(1)
  const dragModeRef = useRef(dragMode)
  dragModeRef.current = dragMode
  // Current selection, mirrored so a Shift-drag can add to it (read at gesture time).
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  // Highlighted tiles as a Set (built once per selection change, not per redraw — a box-select can
  // be large and the draw functions run on every pan/zoom frame).
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // Let a one-finger touch drag scroll the mobile page in "off" mode (no paint/select to capture);
  // otherwise the canvas owns the gesture. Two-finger pan/zoom still works either way.
  useEffect(() => {
    if (hostRef.current) hostRef.current.style.touchAction = dragMode === 'off' ? 'pan-y' : 'none'
  }, [dragMode])

  const redraw = () => {
    tilesLayerRef.current?.batchDraw()
    uiLayerRef.current?.batchDraw()
  }

  // Ease the view to `target` (same scale, new tx/ty) instead of a jump-cut — so bringing a selected
  // tile to the middle reads as "the camera moved to it", not a disorienting snap. Cancels any
  // in-flight tween first; a near-zero move (already centred) just snaps.
  const animateViewTo = (target: View) => {
    cancelAnimationFrame(focusAnimRef.current)
    const from = viewRef.current
    if (Math.abs(from.tx - target.tx) < 0.5 && Math.abs(from.ty - target.ty) < 0.5) {
      viewRef.current = target
      redraw()
      return
    }
    const DURATION = 240
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const k = 1 - (1 - t) ** 3 // ease-out
      viewRef.current = { scale: target.scale, tx: from.tx + (target.tx - from.tx) * k, ty: from.ty + (target.ty - from.ty) * k }
      redraw()
      if (t < 1) focusAnimRef.current = requestAnimationFrame(step)
    }
    focusAnimRef.current = requestAnimationFrame(step)
  }

  // Measure the host — Konva needs explicit pixel dimensions. Coalesce via rAF to avoid the
  // ResizeObserver feedback loop, and tear everything down (StrictMode double-mounts in dev).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = host.getBoundingClientRect()
        const w = Math.round(r.width)
        const h = Math.round(r.height)
        setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  // Read themed colours from CSS variables; re-read when the OS theme flips.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const read = () => {
      const cs = getComputedStyle(host)
      const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb
      paletteRef.current = {
        ...FALLBACK,
        visited: v('--accent-strong', FALLBACK.visited),
        accent: v('--accent', FALLBACK.accent),
        accentStrong: v('--accent-strong', FALLBACK.accentStrong),
        accent2: v('--accent-2', FALLBACK.accent2),
        accent3: v('--accent-3', FALLBACK.accent3),
        mono: v('--mono', FALLBACK.mono),
      }
      redraw()
    }
    read()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [])

  // A new tiling (e.g. a grid-size change) re-frames from scratch.
  useEffect(() => {
    userMovedRef.current = false
  }, [tiling])

  // Re-frame on size / tiling / explicit-Fit / selection changes. A new tiling or a Fit press (the
  // signal changed) re-fits from scratch. Otherwise, a freshly single-selected tile is brought to the
  // centre (and kept there through any resize that follows — e.g. the Inspect pane opening — until the
  // user pans/zooms manually or the selection changes); with no such tile to follow, a plain resize
  // after the user has panned/zoomed only re-clamps so it can't strand the tiling off-screen.
  const lastFitRef = useRef(fitSignal)
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return
    const isNewFit = fitSignal !== lastFitRef.current
    if (isNewFit) {
      lastFitRef.current = fitSignal
      suppressFollowRef.current = true // Fit means "show me everything" — stop following the selection
    }
    const focusId = selectedIds.length === 1 ? selectedIds[0] : null
    if (focusId !== lastFocusIdRef.current) {
      lastFocusIdRef.current = focusId
      suppressFollowRef.current = false // a fresh (or cleared) selection re-arms following
    }
    const focusPoint = focusId && !suppressFollowRef.current ? nodeById(tiling, focusId)?.centroid ?? null : null
    const result = reframeView(viewRef.current, tiling.bounds, size, { isNewFit, focusPoint, userMoved: userMovedRef.current })
    userMovedRef.current = result.userMoved
    if (result.animate) {
      animateViewTo(result.view)
    } else {
      cancelAnimationFrame(focusAnimRef.current)
      viewRef.current = result.view
      redraw()
    }
  }, [size, tiling, fitSignal, selectedIds])

  // Lightweight FPS meter for the grid-size lag probe — frame cadence dips when redraws get heavy.
  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()
    const loop = (now: number) => {
      frames += 1
      if (now - last >= 500) {
        if (fpsRef.current) fpsRef.current.textContent = `${Math.round((frames * 1000) / (now - last))} fps`
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // While a debug log row is hovered/pinned (highlightGroups) OR a path preview is showing (pathPreview),
  // run a gentle sine pulse so the outlines/lines breathe and are easy to pick out on a dense grid. Redraws
  // only the (cheap) UI layer each frame, and stops — resetting to full strength — the moment nothing is
  // highlighted, so it costs nothing at rest. Each prop gets a new identity when it changes, re-arming it.
  const hasHighlight = !!highlightGroups && highlightGroups.length > 0
  const hasPreview = !!pathPreview && pathPreview.length > 0
  useEffect(() => {
    if (!hasHighlight && !hasPreview) {
      pulseRef.current = 1
      return
    }
    let raf = 0
    const PERIOD = 1150 // ms per breath — slow enough to read as a pulse, not a flicker
    const loop = (now: number) => {
      pulseRef.current = 0.5 + 0.5 * Math.sin((now * 2 * Math.PI) / PERIOD)
      uiLayerRef.current?.batchDraw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [hasHighlight, hasPreview])

  // Pointer interaction (no modes): tap a tile to inspect it, drag to paint the visited overlay,
  // two-finger drag (touch) or middle-mouse drag (desktop) to pan, pinch / wheel to zoom. Attached
  // once; reads mirrored refs; torn down on unmount (StrictMode-safe).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const pointers = new Map<number, Vec2>()
    let panLast: Vec2 | null = null
    let pinchLast: number | null = null
    let centerLast: Vec2 | null = null
    let downAt: Vec2 | null = null // start of the current single-pointer gesture
    let moved = false // crossed the slop -> a paint drag, not a tap
    let pinched = false // became two-finger -> never a tap
    let middlePan = false // middle-mouse drag -> pan, never a tap/paint
    let additive = false // Shift held at gesture start -> box/paint-select ADDS to the selection
    let strokePainted: Set<string> | null = null // tiles painted this stroke (dedupe)
    let strokeSelected: Set<string> | null = null // tiles gathered this freehand-select stroke
    let lastPaintWorld: Vec2 | null = null

    const local = (e: PointerEvent | WheelEvent): Vec2 => {
      const r = host.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const apply = (next: View) => {
      cancelAnimationFrame(focusAnimRef.current) // deliberate navigation wins over any in-flight focus pan
      viewRef.current = clampView(next, tilingRef.current.bounds, sizeRef.current)
      userMovedRef.current = true
      suppressFollowRef.current = true // ...and stops a later resize from snapping back to the selection
      redraw()
    }
    // The box-select marquee (a plain DOM rectangle over the canvas), in screen px.
    const setMarquee = (a: Vec2, b: Vec2) => {
      const el = marqueeRef.current
      if (!el) return
      el.style.display = 'block'
      el.style.left = `${Math.min(a.x, b.x)}px`
      el.style.top = `${Math.min(a.y, b.y)}px`
      el.style.width = `${Math.abs(a.x - b.x)}px`
      el.style.height = `${Math.abs(a.y - b.y)}px`
    }
    const hideMarquee = () => {
      if (marqueeRef.current) marqueeRef.current.style.display = 'none'
    }
    // Fade the just-painted outline out over ~600ms after the stroke releases.
    const startFlashFade = () => {
      cancelAnimationFrame(fadeRafRef.current)
      const DURATION = 600
      const start = performance.now()
      const stepFade = (now: number) => {
        const flash = paintFlashRef.current
        if (!flash) return
        flash.alpha = Math.max(0, 1 - (now - start) / DURATION)
        uiLayerRef.current?.batchDraw()
        if (flash.alpha > 0) fadeRafRef.current = requestAnimationFrame(stepFade)
        else paintFlashRef.current = null
      }
      fadeRafRef.current = requestAnimationFrame(stepFade)
    }
    // Paint every tile from the last paint point to `toWorld`, deduped within the stroke. Also keep
    // the ephemeral outline (paintFlashRef) in sync at full opacity while the stroke is live.
    const paintTo = (toWorld: Vec2) => {
      if (!strokePainted) return
      const ids = lastPaintWorld
        ? tilesAlongSegment(tilingRef.current, lastPaintWorld, toWorld)
        : ([pickTile(tilingRef.current, toWorld)].filter(Boolean) as string[])
      const fresh = ids.filter((id) => !strokePainted!.has(id))
      if (fresh.length) {
        for (const id of fresh) strokePainted.add(id)
        onPaintRef.current?.(fresh)
        cancelAnimationFrame(fadeRafRef.current)
        paintFlashRef.current = { ids: strokePainted, alpha: 1 }
        uiLayerRef.current?.batchDraw()
      }
      lastPaintWorld = toWorld
    }
    // Freehand select: gather every tile the stroke passes over and push the growing set up live,
    // so the highlight builds as you drag (same gap-filling as paint, but it selects, not paints).
    const selectTo = (toWorld: Vec2) => {
      if (!strokeSelected) return
      const ids = lastPaintWorld
        ? tilesAlongSegment(tilingRef.current, lastPaintWorld, toWorld)
        : ([pickTile(tilingRef.current, toWorld)].filter(Boolean) as string[])
      let changed = false
      for (const id of ids)
        if (!strokeSelected.has(id)) {
          strokeSelected.add(id)
          changed = true
        }
      if (changed) onSelectTilesRef.current?.([...strokeSelected])
      lastPaintWorld = toWorld
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Pan/zoom is navigation, not a new selection gesture — keep the current selection.
      const { minScale, maxScale } = scaleLimits(tilingRef.current, sizeRef.current)
      apply(zoomAt(viewRef.current, local(e), Math.exp(-e.deltaY * 0.0015), minScale, maxScale))
    }
    const capture = (id: number) => {
      // Keep receiving moves if the finger/mouse leaves the canvas; harmless if unsupported.
      try {
        host.setPointerCapture(id)
      } catch {
        // ignore — capture is a nicety, not required for the gesture
      }
    }
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, local(e))
      const vals = [...pointers.values()]
      if (vals.length === 2) {
        // a second finger ends any stroke and starts a pinch + pan (every mode)
        e.preventDefault()
        capture(e.pointerId)
        strokePainted = null
        strokeSelected = null
        lastPaintWorld = null
        downAt = null
        moved = false
        panLast = null
        pinched = true
        pinchLast = dist(vals[0], vals[1])
        centerLast = { x: (vals[0].x + vals[1].x) / 2, y: (vals[0].y + vals[1].y) / 2 }
        hideMarquee()
        host.style.cursor = 'grabbing'
        return
      }
      if (e.button === 1) {
        // middle-mouse drag pans (every mode)
        e.preventDefault()
        capture(e.pointerId)
        middlePan = true
        panLast = local(e)
        host.style.cursor = 'grabbing'
        return
      }
      // single pointer — tap vs paint/select decided on move/up
      downAt = local(e)
      moved = false
      pinched = false
      middlePan = false
      additive = e.shiftKey // Shift+box / Shift+paint-select adds to the current selection
      strokePainted = null
      lastPaintWorld = null
      // "off" mode doesn't capture or preventDefault, so a touch drag scrolls the page; a tap (no
      // move) still selects on pointerup. paint/select own the gesture.
      if (dragModeRef.current !== 'off') {
        e.preventDefault()
        capture(e.pointerId)
      }
    }
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      const p = local(e)
      pointers.set(e.pointerId, p)
      const vals = [...pointers.values()]
      if (vals.length >= 2) {
        const d = dist(vals[0], vals[1])
        const center = { x: (vals[0].x + vals[1].x) / 2, y: (vals[0].y + vals[1].y) / 2 }
        if (pinchLast && centerLast) {
          const { minScale, maxScale } = scaleLimits(tilingRef.current, sizeRef.current)
          let v = zoomAt(viewRef.current, center, d / pinchLast, minScale, maxScale)
          v = panBy(v, center.x - centerLast.x, center.y - centerLast.y)
          apply(v)
        }
        pinchLast = d
        centerLast = center
        return
      }
      if (middlePan && panLast) {
        apply(panBy(viewRef.current, p.x - panLast.x, p.y - panLast.y))
        panLast = p
        return
      }
      // single pointer: a drag past the slop does the current mode's action; a tap stays a select.
      if (!downAt) return
      const slop = e.pointerType === 'touch' ? 12 : 6
      const mode = dragModeRef.current
      if (mode === 'off') {
        // not capturing — a moved touch is the browser scrolling, so it's no longer a tap
        if (dist(p, downAt) > slop) moved = true
        return
      }
      if (mode === 'select') {
        if (!moved && dist(p, downAt) > slop) moved = true
        if (moved) setMarquee(downAt, p)
        return
      }
      if (mode === 'paintselect') {
        if (!moved) {
          if (dist(p, downAt) > slop) {
            moved = true
            strokeSelected = new Set(additive ? selectedIdsRef.current : []) // Shift adds to the selection
            lastPaintWorld = null
            selectTo(screenToWorld(downAt, viewRef.current))
            selectTo(screenToWorld(p, viewRef.current))
          }
          return
        }
        selectTo(screenToWorld(p, viewRef.current))
        return
      }
      // paint
      if (!moved) {
        if (dist(p, downAt) > slop) {
          moved = true
          onDeselectRef.current?.() // painting is "interacting some other way" — drop the selection
          strokePainted = new Set()
          lastPaintWorld = null
          paintTo(screenToWorld(downAt, viewRef.current)) // the tile the drag started on
          paintTo(screenToWorld(p, viewRef.current)) // fill the gap to here
        }
        return
      }
      paintTo(screenToWorld(p, viewRef.current))
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      const vals = [...pointers.values()]
      if (vals.length === 0) {
        if (!pinched && !middlePan && !moved && downAt) {
          // a tap selects the tile under the press, or clears the selection if it hit empty space
          const id = pickTile(tilingRef.current, screenToWorld(downAt, viewRef.current))
          if (id) onSelectRef.current?.(id)
          else onDeselectRef.current?.()
        } else if (dragModeRef.current === 'select' && moved && downAt) {
          // a box drag selects every tile whose centre is inside it; Shift adds to the current set
          const a = screenToWorld(downAt, viewRef.current)
          const b = screenToWorld(local(e), viewRef.current)
          const rectTiles = tilesInRect(tilingRef.current, a, b)
          onSelectTilesRef.current?.(additive ? [...new Set([...selectedIdsRef.current, ...rectTiles])] : rectTiles)
        } else if (moved && strokePainted && strokePainted.size > 0) {
          // a paint stroke just ended — fade its outline out
          startFlashFade()
        }
        hideMarquee()
        panLast = null
        pinchLast = null
        centerLast = null
        downAt = null
        moved = false
        pinched = false
        middlePan = false
        strokePainted = null
        strokeSelected = null
        lastPaintWorld = null
        host.style.cursor = 'crosshair'
      } else if (vals.length === 1) {
        // dropped from a pinch to one finger: keep navigating, never a tap or paint
        panLast = vals[0]
        pinchLast = null
        centerLast = null
        moved = true
        strokePainted = null
        lastPaintWorld = null
      }
    }

    host.addEventListener('wheel', onWheel, { passive: false })
    host.addEventListener('pointerdown', onDown)
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerup', onUp)
    host.addEventListener('pointercancel', onUp)
    return () => {
      host.removeEventListener('wheel', onWheel)
      host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerup', onUp)
      host.removeEventListener('pointercancel', onUp)
      cancelAnimationFrame(fadeRafRef.current)
      cancelAnimationFrame(focusAnimRef.current)
    }
  }, [])

  return (
    <div ref={hostRef} className="tiling-canvas">
      {size.width > 0 && size.height > 0 && (
        <Stage width={size.width} height={size.height}>
          <Layer ref={tilesLayerRef} listening={false}>
            <Shape
              listening={false}
              sceneFunc={(ctx) =>
                drawTiles(ctx, tiling, viewRef.current, size, paletteRef.current, selectedSet, overlay, colorFor, displayMode, tileNumber, traverserHeads, autoTraverserHeads)
              }
            />
          </Layer>
          <Layer ref={uiLayerRef} listening={false}>
            <Shape
              listening={false}
              sceneFunc={(ctx) => drawHighlights(ctx, tiling, viewRef.current, paletteRef.current, highlightGroups, pulseRef.current)}
            />
            <Shape
              listening={false}
              sceneFunc={(ctx) => drawPathPreview(ctx, tiling, viewRef.current, pathPreview, pulseRef.current)}
            />
            <Shape
              listening={false}
              sceneFunc={(ctx) => drawSelection(ctx, tiling, viewRef.current, paletteRef.current, selectedSet)}
            />
            <Shape
              listening={false}
              sceneFunc={(ctx) => drawTraverserHeads(ctx, tiling, viewRef.current, paletteRef.current, traverserHeads, autoTraverserHeads)}
            />
            <Shape
              listening={false}
              sceneFunc={(ctx) => drawPaintFlash(ctx, tiling, viewRef.current, paletteRef.current, paintFlashRef.current)}
            />
          </Layer>
        </Stage>
      )}
      <div ref={marqueeRef} className="canvas-marquee" aria-hidden="true" />
      <div className="canvas-hud" aria-hidden="true">
        <span>{tiling.nodes.length.toLocaleString()} tiles</span>
        <span ref={fpsRef}>— fps</span>
      </div>
    </div>
  )
}

// Zoom bounds: can't shrink far past the fitted view, and a single tile can't grow past ~200
// screen px. Built so the fit scale always sits within [minScale, maxScale].
function scaleLimits(tiling: Tiling, size: Size): { minScale: number; maxScale: number } {
  const fit = fitToView(tiling.bounds, size).scale
  const maxScale = Math.max(fit, 200 / representativeTileSize(tiling))
  return { minScale: Math.min(fit * 0.4, maxScale), maxScale }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function traceTile(ctx: Konva.Context, verts: ReadonlyArray<Vec2>, view: View): void {
  ctx.beginPath()
  const p0 = worldToScreen(verts[0], view)
  ctx.moveTo(p0.x, p0.y)
  for (let i = 1; i < verts.length; i += 1) {
    const p = worldToScreen(verts[i], view)
    ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
}

function drawTiles(
  ctx: Konva.Context,
  tiling: Tiling,
  view: View,
  size: Size,
  pal: Palette,
  selectedSet: ReadonlySet<string>,
  overlay: ReadonlyMap<string, TileState> | undefined,
  colorFor: ReadonlyMap<string, string> | undefined,
  displayMode: DisplayMode,
  tileNumber: ((id: string) => number) | undefined,
  // Tiles carrying a traverser (hand OR auto) show only its arrow — their printed labels are suppressed below.
  traverserHeads: ReadonlyMap<string, number> | undefined,
  autoTraverserHeads: ReadonlyMap<string, number> | undefined,
): void {
  const ov = overlay ?? NO_OVERLAY
  const hasTraverser = (id: string) => (traverserHeads?.has(id) ?? false) || (autoTraverserHeads?.has(id) ?? false)
  // World-space viewport (+ one-tile margin) — skip tiles off-screen so cost tracks what's
  // visible, not the total tile count.
  const margin = representativeTileSize(tiling)
  const a = screenToWorld({ x: 0, y: 0 }, view)
  const b = screenToWorld({ x: size.width, y: size.height }, view)
  const minX = Math.min(a.x, b.x) - margin
  const maxX = Math.max(a.x, b.x) + margin
  const minY = Math.min(a.y, b.y) - margin
  const maxY = Math.max(a.y, b.y) + margin
  const onScreen = (c: Vec2) => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY

  // No-edge mode renders FLUSH (must match renderTiling.ts in the exporter): a thin stroke can't hide
  // the anti-alias seam between adjacent fills (the background bleeds ~25% at every shared edge), so
  // instead we fill each tile ONCE with its flattened OPAQUE colour on a slightly inflated polygon, so
  // neighbours overlap and no seam shows. With edges on, the edge stroke covers the seam, so keep the
  // base→colour layering there. See src/canvas/flush.ts.
  const flush = displayMode === 'none'
  const inflate = flush && view.scale > 0 ? FLUSH_OVERLAP_PX / view.scale : 0
  for (const node of tiling.nodes) {
    if (!onScreen(node.centroid)) continue
    if (flush) {
      traceTile(ctx, inflatePolygon(node.vertices, node.centroid, inflate), view)
      ctx.setAttr('fillStyle', flattenColor(colorFor?.get(node.id), pal.tile))
      ctx.fill()
    } else {
      traceTile(ctx, node.vertices, view)
      ctx.setAttr('fillStyle', pal.tile)
      ctx.fill()
      const fill = colorFor?.get(node.id)
      if (fill) {
        ctx.setAttr('fillStyle', fill)
        ctx.fill()
      }
    }
    if (selectedSet.has(node.id)) {
      traceTile(ctx, node.vertices, view) // accent on the true tile shape, not the inflated one
      ctx.save()
      ctx.setAttr('globalAlpha', 0.14)
      ctx.setAttr('fillStyle', pal.accent)
      ctx.fill()
      ctx.restore()
    }
    if (!flush) {
      ctx.setAttr('strokeStyle', pal.edge)
      ctx.setAttr('lineWidth', 1)
      ctx.stroke()
    }
  }

  // No-edge (flush) mode draws no per-tile outlines — but trace the whole grid's outer perimeter with a
  // thin black line so it reads as one bounded plane instead of fills floating on the background. The
  // boundary edges (b === null) ARE the perimeter; there are only O(perimeter) of them, so no culling.
  if (flush) {
    ctx.beginPath()
    for (const e of tiling.edges) {
      if (e.b !== null) continue
      const p = worldToScreen(e.p, view)
      const q = worldToScreen(e.q, view)
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
    }
    ctx.setAttr('strokeStyle', pal.edge)
    ctx.setAttr('lineWidth', 1)
    ctx.setAttr('lineJoin', 'round')
    ctx.stroke()
  }

  // Stats mode only: print the tile number + visited count inside each tile. Labels need a few
  // screen px to be legible (and cheap), so on very large grids at fit they hide until you zoom in.
  // Drawn in two passes (numbers, then vN); within each, the font only changes when a tile's
  // per-shape size differs, so it's set about once per shape rather than once per tile.
  if (displayMode !== 'stats') return
  // Labels track zoom up to MAX_LABEL_PX, then hold — capping the scale keeps the number/vN ratio
  // and the vertical offsets (below) consistent whether or not the cap is in effect.
  const labelScale = Math.min(view.scale, MAX_LABEL_PX / 0.3)
  // Triangles get a smaller share of the tile (20% vs 30%): their centroid sits much closer to the
  // edges than a square/hexagon's, so an equal fraction reads as cramped.
  const numPxFor = (shape: string) => (shape === 'triangle' ? 0.2 : 0.3) * labelScale
  const visPxFor = (shape: string) => numPxFor(shape) * (0.26 / 0.3)
  const anyVisited = [...ov.values()].some((s) => s.visits.length > 0)
  // Quick out if even the roomiest shape's label would fall below the legibility floor.
  if (0.3 * labelScale < MIN_LABEL_PX && !(anyVisited && 0.26 * labelScale >= MIN_LABEL_PX)) return
  ctx.setAttr('textAlign', 'center')
  ctx.setAttr('textBaseline', 'middle')

  // Number pass.
  ctx.setAttr('fillStyle', pal.num)
  let lastFont = ''
  for (const node of tiling.nodes) {
    if (!onScreen(node.centroid)) continue
    if (hasTraverser(node.id)) continue
    const numPx = numPxFor(node.shape)
    if (numPx < MIN_LABEL_PX) continue
    const font = `${numPx}px ${pal.mono}`
    if (font !== lastFont) {
      ctx.setAttr('font', font)
      lastFont = font
    }
    const c = worldToScreen(node.centroid, view)
    // nudge the number up a touch when a vN sits below it
    const hasV = anyVisited && visitCount(tileState(ov, node.id)) > 0
    ctx.fillText(tileNumber ? String(tileNumber(node.id)) : '', c.x, hasV ? c.y - numPx * 0.5 : c.y)
  }

  // Visited pass.
  if (anyVisited) {
    ctx.setAttr('fillStyle', pal.visited)
    lastFont = ''
    for (const node of tiling.nodes) {
      if (!onScreen(node.centroid)) continue
      if (hasTraverser(node.id)) continue
      const v = visitCount(tileState(ov, node.id))
      if (v <= 0) continue
      const visPx = visPxFor(node.shape)
      if (visPx < MIN_LABEL_PX) continue
      const font = `700 ${visPx}px ${pal.mono}`
      if (font !== lastFont) {
        ctx.setAttr('font', font)
        lastFont = font
      }
      const c = worldToScreen(node.centroid, view)
      const numPx = numPxFor(node.shape)
      ctx.fillText(`v${v}`, c.x, numPx >= MIN_LABEL_PX ? c.y + numPx * 0.7 : c.y)
    }
  }

  // Registries pass: any non-zero A/B/C printed as a compact "A# B# C#" line beneath vN, in the
  // neutral number colour. Slightly smaller than vN, gated by the same legibility floor.
  const anyReg = [...ov.values()].some((s) => s.a !== 0 || s.b !== 0 || s.c !== 0)
  if (anyReg) {
    ctx.setAttr('fillStyle', pal.num)
    lastFont = ''
    for (const node of tiling.nodes) {
      if (!onScreen(node.centroid)) continue
      if (hasTraverser(node.id)) continue
      const s = ov.get(node.id)
      if (!s || (s.a === 0 && s.b === 0 && s.c === 0)) continue
      const numPx = numPxFor(node.shape)
      const regPx = numPx * (0.24 / 0.3)
      if (regPx < MIN_LABEL_PX) continue
      const font = `${regPx}px ${pal.mono}`
      if (font !== lastFont) {
        ctx.setAttr('font', font)
        lastFont = font
      }
      const parts: string[] = []
      if (s.a !== 0) parts.push(`A${s.a}`)
      if (s.b !== 0) parts.push(`B${s.b}`)
      if (s.c !== 0) parts.push(`C${s.c}`)
      const c = worldToScreen(node.centroid, view)
      // sit a line below vN when this tile has visits, else where vN would be (below the number)
      const dy = numPx * 0.7 + (s.visits.length > 0 ? regPx * 1.15 : 0)
      ctx.fillText(parts.join(' '), c.x, c.y + dy)
    }
  }
}

// A single selected tile is drawn slightly enlarged with a strong outline (the focused look). A
// multi-tile box-select shows only as the faint accent fill drawTiles already paints on each
// selected tile (culled to the viewport), so a big selection costs nothing extra per frame.
function drawSelection(ctx: Konva.Context, tiling: Tiling, view: View, pal: Palette, selectedSet: ReadonlySet<string>): void {
  if (selectedSet.size !== 1) return
  const [selectedId] = selectedSet
  const node = nodeById(tiling, selectedId)
  if (!node) return
  traceTile(
    ctx,
    node.vertices.map((v) => scaleAround(v, node.centroid, HIGHLIGHT_SCALE)),
    view,
  )
  ctx.save()
  ctx.setAttr('globalAlpha', 0.22)
  ctx.setAttr('fillStyle', pal.accent)
  ctx.fill()
  ctx.restore()
  ctx.setAttr('strokeStyle', pal.accentStrong)
  ctx.setAttr('lineWidth', 2.5)
  ctx.stroke()
}

// A traverser's head: a solid, pointy triangle through the tile centre, apex pointing at the edge the
// walker faces (headingArrowDir — the raw heading on convex tiles, the faced edge's midpoint on the
// concave wedge). Heading is radians world y-up; the world->screen flip negates y. Always drawn (any
// display mode); a tile with a head suppresses its printed labels (drawTiles).
function drawTraverserHeads(
  ctx: Konva.Context,
  tiling: Tiling,
  view: View,
  pal: Palette,
  heads: ReadonlyMap<string, number> | undefined,
  autoHeads: ReadonlyMap<string, number> | undefined,
): void {
  const solid = heads && heads.size ? heads : undefined
  const ghost = autoHeads && autoHeads.size ? autoHeads : undefined
  if (!solid && !ghost) return
  const tilePx = representativeTileSize(tiling) * view.scale
  const len = Math.max(14, Math.min(tilePx * 0.62, 54)) // tip-to-base length
  const halfW = len * 0.34 // half the base width — kept well under `len` so the triangle stays pointy
  const drawOne = (id: string, heading: number) => {
    const node = nodeById(tiling, id)
    if (!node) return
    const c = worldToScreen(node.centroid, view)
    const dir = headingArrowDir(node, heading) // points AT the faced edge on a concave wedge
    const dx = dir.x
    const dy = -dir.y // world y-up -> screen y-down (unit vector)
    const px = -dy // perpendicular (unit), for the base corners
    const py = dx
    const tip = { x: c.x + dx * len * 0.6, y: c.y + dy * len * 0.6 }
    const bx = c.x - dx * len * 0.4 // base centre, behind the tile centre
    const by = c.y - dy * len * 0.4
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(bx + px * halfW, by + py * halfW)
    ctx.lineTo(bx - px * halfW, by - py * halfW)
    ctx.closePath()
    ctx.fill()
  }
  ctx.save()
  // Ghost (auto-placed) first, solid (hand/running) on top so a hand seed always reads clearly.
  if (ghost) {
    ctx.setAttr('fillStyle', pal.traverserAuto)
    for (const [id, heading] of ghost) drawOne(id, heading)
  }
  if (solid) {
    ctx.setAttr('fillStyle', pal.traverser)
    for (const [id, heading] of solid) drawOne(id, heading)
  }
  ctx.restore()
}

// Ephemeral outline on the tiles of a paint stroke — full opacity while painting, fading to 0 after
// release (the alpha is driven by the fade rAF). A stroke is a handful of tiles, so no culling needed.
function drawPaintFlash(
  ctx: Konva.Context,
  tiling: Tiling,
  view: View,
  pal: Palette,
  flash: { ids: Set<string>; alpha: number } | null,
): void {
  if (!flash || flash.alpha <= 0) return
  ctx.save()
  ctx.setAttr('globalAlpha', flash.alpha)
  ctx.setAttr('strokeStyle', pal.accentStrong)
  ctx.setAttr('lineWidth', 2)
  ctx.setAttr('lineJoin', 'round')
  for (const id of flash.ids) {
    const node = nodeById(tiling, id)
    if (!node) continue
    traceTile(ctx, node.vertices, view)
    ctx.stroke()
  }
  ctx.restore()
}

// Per-role stroke style for the debug highlight overlay. Reuses the brand accents (no new colours):
// orange = current/chosen (the focus), purple-dashed = a decoration pointer, magenta = a candidate,
// faded red-dashed = a rejected candidate, magenta-filled = a written tile. Kept distinct by colour +
// dash + weight so they read in both themes.
type HiStyle = { stroke: string; lineWidth: number; dash?: number[]; fillAlpha?: number; alpha?: number }
function roleStyle(role: HighlightRole, pal: Palette): HiStyle {
  switch (role) {
    case 'current':
      return { stroke: pal.accent, lineWidth: 3, fillAlpha: 0.12 }
    case 'decorator':
      return { stroke: pal.accent3, lineWidth: 2.5, dash: [6, 4] }
    case 'candidate':
      return { stroke: pal.accent2, lineWidth: 2.5 }
    case 'chosen':
      return { stroke: pal.accent, lineWidth: 3.5, fillAlpha: 0.16 }
    case 'rejected':
      return { stroke: pal.accentStrong, lineWidth: 1.5, dash: [3, 3], alpha: 0.65 }
    case 'write':
      return { stroke: pal.accent2, lineWidth: 3, fillAlpha: 0.16 }
  }
}

// The debug decision-log highlight: outline each group's tiles in its role colour. A hover lights a
// handful of tiles, so no viewport culling (mirrors drawPaintFlash). Undefined/empty = nothing drawn.
// `pulse` (0..1, driven by a rAF while a hover is active) gently breathes the outline's opacity + weight
// so it's easy to spot on a busy grid; 1 = full strength (a static, non-hovered draw).
function drawHighlights(
  ctx: Konva.Context,
  tiling: Tiling,
  view: View,
  pal: Palette,
  groups: HighlightGroups | undefined,
  pulse = 1,
): void {
  if (!groups || groups.length === 0) return
  const alphaK = 0.6 + 0.4 * pulse // opacity swings 60%..100% of the role's base
  const widthK = 1 + 0.35 * pulse // line weight swings 1x..1.35x
  for (const { role, ids } of groups) {
    if (ids.length === 0) continue
    const s = roleStyle(role, pal)
    const base = s.alpha ?? 1
    ctx.save()
    ctx.setAttr('globalAlpha', base * alphaK)
    ctx.setAttr('strokeStyle', s.stroke)
    ctx.setAttr('lineWidth', s.lineWidth * widthK)
    ctx.setAttr('lineJoin', 'round')
    if (s.dash) ctx.setLineDash(s.dash)
    for (const id of ids) {
      const node = nodeById(tiling, id)
      if (!node) continue
      traceTile(ctx, node.vertices, view)
      if (s.fillAlpha) {
        ctx.save()
        ctx.setAttr('globalAlpha', base * alphaK * s.fillAlpha)
        ctx.setAttr('fillStyle', s.stroke)
        ctx.fill()
        ctx.restore()
      }
      ctx.stroke()
    }
    if (s.dash) ctx.setLineDash([])
    ctx.restore()
  }
}

// The path preview overlay: draw each selected traverser path as a pulsating polyline through the tile
// centres, with the FINAL tile outlined + faintly filled, in that path's per-source-line colour. A thin
// translucent-white casing under every stroke keeps the coloured line legible over a similar coloring fill
// (the base tiles are white, so it's invisible there). Undefined/empty = nothing drawn. `pulse` (0..1)
// breathes opacity + weight, shared with drawHighlights. Walks are short (max-steps), so no culling.
function drawPathPreview(
  ctx: Konva.Context,
  tiling: Tiling,
  view: View,
  paths: ReadonlyArray<{ tiles: ReadonlyArray<string>; color: string }> | undefined,
  pulse = 1,
): void {
  if (!paths || paths.length === 0) return
  const alphaK = 0.55 + 0.45 * pulse
  const widthK = 1 + 0.4 * pulse
  const tilePx = representativeTileSize(tiling) * view.scale
  const lineW = Math.max(2, tilePx * 0.09)
  const outlineW = Math.max(2.5, tilePx * 0.08)
  ctx.save()
  ctx.setAttr('lineJoin', 'round')
  ctx.setAttr('lineCap', 'round')
  for (const { tiles, color } of paths) {
    if (tiles.length === 0) continue
    // The polyline through the tile centres (only when the walk visits more than one tile).
    if (tiles.length > 1) {
      const pts: Array<{ x: number; y: number }> = []
      for (const id of tiles) {
        const node = nodeById(tiling, id)
        if (node) pts.push(worldToScreen(node.centroid, view))
      }
      if (pts.length > 1) {
        const stroke = (w: number, style: string, a: number) => {
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
          ctx.setAttr('globalAlpha', a)
          ctx.setAttr('strokeStyle', style)
          ctx.setAttr('lineWidth', w)
          ctx.stroke()
        }
        stroke((lineW + 3) * widthK, '#ffffff', 0.7 * alphaK) // casing
        stroke(lineW * widthK, color, alphaK)
      }
    }
    // The terminal tile: a faint fill and a strong outline (with its own white casing), both pulsing.
    const term = nodeById(tiling, tiles[tiles.length - 1])
    if (term) {
      traceTile(ctx, term.vertices, view)
      ctx.setAttr('globalAlpha', alphaK * 0.18)
      ctx.setAttr('fillStyle', color)
      ctx.fill()
      ctx.setAttr('globalAlpha', 0.7 * alphaK)
      ctx.setAttr('strokeStyle', '#ffffff')
      ctx.setAttr('lineWidth', (outlineW + 3) * widthK)
      ctx.stroke()
      ctx.setAttr('globalAlpha', alphaK)
      ctx.setAttr('strokeStyle', color)
      ctx.setAttr('lineWidth', outlineW * widthK)
      ctx.stroke()
    }
  }
  ctx.restore()
}
