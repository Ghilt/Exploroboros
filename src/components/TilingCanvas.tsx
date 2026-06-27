import './TilingCanvas.css'
import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Shape } from 'react-konva'
import Konva from 'konva'
import type { Tiling, Vec2 } from '../tiling'
import { nodeById, scaleAround } from '../tiling'
import {
  fitToView,
  worldToScreen,
  screenToWorld,
  zoomAt,
  panBy,
  clampView,
  pickTile,
  tilesAlongSegment,
  representativeTileSize,
} from '../canvas'
import type { View, Size } from '../canvas'

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

type Palette = {
  tile: string
  edge: string
  num: string
  visited: string
  accent: string
  accentStrong: string
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
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

type Props = {
  tiling: Tiling
  showNumbers?: boolean
  selectedId?: string | null
  visited?: ReadonlyMap<string, number>
  tileNumber?: (id: string) => number
  onSelect?: (id: string) => void
  onPaint?: (ids: ReadonlyArray<string>) => void
  // Bumping this counter (e.g. a Fit button) re-frames the whole tiling.
  fitSignal?: number
}

export function TilingCanvas({
  tiling,
  showNumbers = false,
  selectedId = null,
  visited,
  tileNumber,
  onSelect,
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
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onPaintRef = useRef(onPaint)
  onPaintRef.current = onPaint

  const redraw = () => {
    tilesLayerRef.current?.batchDraw()
    uiLayerRef.current?.batchDraw()
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

  // Re-frame on size / tiling / explicit-Fit changes. A new tiling or a Fit press (the signal
  // changed) re-fits from scratch; a plain resize after the user has panned/zoomed only re-clamps
  // so it can't strand the tiling off-screen while preserving their zoom.
  const lastFitRef = useRef(fitSignal)
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return
    if (fitSignal !== lastFitRef.current) {
      lastFitRef.current = fitSignal
      userMovedRef.current = false
    }
    viewRef.current = userMovedRef.current
      ? clampView(viewRef.current, tiling.bounds, size)
      : fitToView(tiling.bounds, size)
    redraw()
  }, [size, tiling, fitSignal])

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
    let strokePainted: Set<string> | null = null // tiles painted this stroke (dedupe)
    let lastPaintWorld: Vec2 | null = null

    const local = (e: PointerEvent | WheelEvent): Vec2 => {
      const r = host.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const apply = (next: View) => {
      viewRef.current = clampView(next, tilingRef.current.bounds, sizeRef.current)
      userMovedRef.current = true
      redraw()
    }
    // Paint every tile from the last paint point to `toWorld`, deduped within the stroke.
    const paintTo = (toWorld: Vec2) => {
      if (!strokePainted) return
      const ids = lastPaintWorld
        ? tilesAlongSegment(tilingRef.current, lastPaintWorld, toWorld)
        : ([pickTile(tilingRef.current, toWorld)].filter(Boolean) as string[])
      const fresh = ids.filter((id) => !strokePainted!.has(id))
      if (fresh.length) {
        for (const id of fresh) strokePainted.add(id)
        onPaintRef.current?.(fresh)
      }
      lastPaintWorld = toWorld
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { minScale, maxScale } = scaleLimits(tilingRef.current, sizeRef.current)
      apply(zoomAt(viewRef.current, local(e), Math.exp(-e.deltaY * 0.0015), minScale, maxScale))
    }
    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      // Keep receiving moves if the finger/mouse leaves the canvas; harmless if unsupported.
      try {
        host.setPointerCapture(e.pointerId)
      } catch {
        // ignore — capture is a nicety, not required for the gesture
      }
      pointers.set(e.pointerId, local(e))
      const vals = [...pointers.values()]
      if (vals.length === 2) {
        // a second finger ends any paint stroke and starts a pinch + pan
        strokePainted = null
        lastPaintWorld = null
        downAt = null
        moved = false
        panLast = null
        pinched = true
        pinchLast = dist(vals[0], vals[1])
        centerLast = { x: (vals[0].x + vals[1].x) / 2, y: (vals[0].y + vals[1].y) / 2 }
        host.style.cursor = 'grabbing'
        return
      }
      if (e.button === 1) {
        // middle-mouse drag pans (left-drag is reserved for painting)
        middlePan = true
        panLast = local(e)
        host.style.cursor = 'grabbing'
        return
      }
      // left button / single touch — tap vs paint decided on move/up
      downAt = local(e)
      moved = false
      pinched = false
      middlePan = false
      strokePainted = null
      lastPaintWorld = null
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
      // single pointer: a drag past the slop becomes a paint stroke (a tap stays a select)
      if (!downAt) return
      const slop = e.pointerType === 'touch' ? 12 : 6
      if (!moved) {
        if (dist(p, downAt) > slop) {
          moved = true
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
          // a tap selects the tile under the press
          const id = pickTile(tilingRef.current, screenToWorld(downAt, viewRef.current))
          if (id) onSelectRef.current?.(id)
        }
        panLast = null
        pinchLast = null
        centerLast = null
        downAt = null
        moved = false
        pinched = false
        middlePan = false
        strokePainted = null
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
                drawTiles(ctx, tiling, viewRef.current, size, paletteRef.current, selectedId, visited, showNumbers, tileNumber)
              }
            />
          </Layer>
          <Layer ref={uiLayerRef} listening={false}>
            <Shape
              listening={false}
              sceneFunc={(ctx) => drawSelection(ctx, tiling, viewRef.current, paletteRef.current, selectedId)}
            />
          </Layer>
        </Stage>
      )}
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
  selectedId: string | null,
  visited: ReadonlyMap<string, number> | undefined,
  showNumbers: boolean,
  tileNumber: ((id: string) => number) | undefined,
): void {
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

  for (const node of tiling.nodes) {
    if (!onScreen(node.centroid)) continue
    traceTile(ctx, node.vertices, view)
    ctx.setAttr('fillStyle', pal.tile)
    ctx.fill()
    const v = visited?.get(node.id) ?? 0
    if (v > 0) {
      // Visited tiles shade accent, deeper with the count, so painted regions read at a glance.
      ctx.save()
      ctx.setAttr('globalAlpha', Math.min(0.7, 0.18 + 0.14 * v))
      ctx.setAttr('fillStyle', pal.accent)
      ctx.fill()
      ctx.restore()
    }
    if (node.id === selectedId) {
      ctx.save()
      ctx.setAttr('globalAlpha', 0.14)
      ctx.setAttr('fillStyle', pal.accent)
      ctx.fill()
      ctx.restore()
    }
    ctx.setAttr('strokeStyle', pal.edge)
    ctx.setAttr('lineWidth', 1)
    ctx.stroke()
  }

  // Labels only when there's something to show AND they'd be large enough to read.
  const numPx = 0.3 * view.scale
  const visPx = 0.26 * view.scale
  const anyVisited = visited ? [...visited.values()].some((n) => n > 0) : false
  const showNums = showNumbers && numPx >= 6
  const showVisited = anyVisited && visPx >= 6
  if (!showNums && !showVisited) return
  ctx.setAttr('textAlign', 'center')
  ctx.setAttr('textBaseline', 'middle')
  for (const node of tiling.nodes) {
    if (!onScreen(node.centroid)) continue
    const v = visited?.get(node.id) ?? 0
    if (!showNums && !(showVisited && v > 0)) continue
    const c = worldToScreen(node.centroid, view)
    if (showNums) {
      ctx.setAttr('font', `${numPx}px ${pal.mono}`)
      ctx.setAttr('fillStyle', pal.num)
      ctx.fillText(tileNumber ? String(tileNumber(node.id)) : '', c.x, c.y + (v > 0 ? -numPx * 0.5 : 0))
    }
    if (showVisited && v > 0) {
      ctx.setAttr('font', `700 ${visPx}px ${pal.mono}`)
      ctx.setAttr('fillStyle', pal.visited)
      ctx.fillText(`v${v}`, c.x, c.y + (showNums ? numPx * 0.7 : 0))
    }
  }
}

// The selected tile, drawn slightly enlarged on its own layer — matches the SVG SelectionOverlay
// (accent 22% fill, accent-strong stroke).
function drawSelection(ctx: Konva.Context, tiling: Tiling, view: View, pal: Palette, selectedId: string | null): void {
  if (!selectedId) return
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
