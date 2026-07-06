// Pure world<->screen mapping for the interactive canvas — the single source of truth shared
// by the renderer (draw) and hit-testing (pick), so the two can never drift. World is y-up
// (tiling geometry); screen/canvas is y-down pixels. The y-flip is baked into the mapping via
// a negative y-scale, NOT a Konva stage scaleY(-1) (which would mirror text too).

import type { Vec2, Bounds } from '../tiling'

// scale = screen px per world unit; (tx, ty) = screen translation.
//   screen.x =  world.x * scale + tx
//   screen.y = -world.y * scale + ty   (the negative y-scale is the y-up -> y-down flip)
export type View = { scale: number; tx: number; ty: number }

export type Size = { width: number; height: number }

export function worldToScreen(p: Vec2, view: View): Vec2 {
  return { x: p.x * view.scale + view.tx, y: -p.y * view.scale + view.ty }
}

export function screenToWorld(s: Vec2, view: View): Vec2 {
  return { x: (s.x - view.tx) / view.scale, y: (view.ty - s.y) / view.scale }
}

export function clampScale(scale: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, scale))
}

// Anchored zoom: keep the world point currently under `anchor` (screen px) fixed while scaling
// by `factor`. Used by both wheel-zoom (anchor = cursor) and pinch (anchor = midpoint).
export function zoomAt(view: View, anchor: Vec2, factor: number, min: number, max: number): View {
  const newScale = clampScale(view.scale * factor, min, max)
  const world = screenToWorld(anchor, view)
  // Solve worldToScreen(world, next) === anchor for tx, ty.
  return {
    scale: newScale,
    tx: anchor.x - world.x * newScale,
    ty: anchor.y + world.y * newScale,
  }
}

// Pan by a screen-space delta.
export function panBy(view: View, dx: number, dy: number): View {
  return { scale: view.scale, tx: view.tx + dx, ty: view.ty + dy }
}

// Pan (scale unchanged) so `point` lands at the centre of `container` — used to keep a selected
// tile in view, e.g. when a side pane opens and narrows the canvas out from under it.
export function centerOn(view: View, point: Vec2, container: Size): View {
  return {
    scale: view.scale,
    tx: container.width / 2 - point.x * view.scale,
    ty: container.height / 2 + point.y * view.scale,
  }
}

// Frame the whole tiling in `container`, centered, with a fractional padding (mirrors the SVG
// debug view's 4% margin and its preserveAspectRatio="xMidYMid meet").
export function fitToView(bounds: Bounds, container: Size, padFrac = 0.04): View {
  const worldW = bounds.maxX - bounds.minX
  const worldH = bounds.maxY - bounds.minY
  if (!(worldW > 0) || !(worldH > 0) || !(container.width > 0) || !(container.height > 0)) {
    return { scale: 1, tx: 0, ty: 0 }
  }
  const pad = padFrac * Math.max(worldW, worldH)
  const scale = Math.min(container.width / (worldW + 2 * pad), container.height / (worldH + 2 * pad))
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return {
    scale,
    tx: container.width / 2 - cx * scale,
    ty: container.height / 2 + cy * scale,
  }
}

// Keep the tiling from being panned out of view: if its on-screen extent exceeds the container
// on an axis, clamp so empty space can't open inside the viewport; if smaller, center on it.
export function clampView(view: View, bounds: Bounds, container: Size): View {
  // World top-left maps to screen top-left (the y-flip swaps min/max y).
  const tl = worldToScreen({ x: bounds.minX, y: bounds.maxY }, view)
  const br = worldToScreen({ x: bounds.maxX, y: bounds.minY }, view)
  let tx = view.tx
  let ty = view.ty

  if (br.x - tl.x <= container.width) {
    tx += container.width / 2 - (tl.x + br.x) / 2
  } else if (tl.x > 0) {
    tx -= tl.x
  } else if (br.x < container.width) {
    tx += container.width - br.x
  }

  if (br.y - tl.y <= container.height) {
    ty += container.height / 2 - (tl.y + br.y) / 2
  } else if (tl.y > 0) {
    ty -= tl.y
  } else if (br.y < container.height) {
    ty += container.height - br.y
  }

  return { scale: view.scale, tx, ty }
}

// The re-frame decision for TilingCanvas's size/tiling/fit/selection effect, extracted so the
// fit-vs-follow-vs-clamp branching is unit-testable without a live Konva canvas (which jsdom can't
// back). `focusPoint` is the world point to keep centred (a freshly selected tile's centroid), or
// null when there's nothing to follow.
export type ReframeInput = {
  isNewFit: boolean
  focusPoint: Vec2 | null
  userMoved: boolean
}
export type ReframeResult = {
  view: View
  // true = ease from the current view to `view` (a focus pan); false = jump straight to it.
  animate: boolean
  userMoved: boolean
}

export function reframeView(current: View, bounds: Bounds, container: Size, input: ReframeInput): ReframeResult {
  if (input.isNewFit) {
    return { view: fitToView(bounds, container), animate: false, userMoved: false }
  }
  if (input.focusPoint) {
    return { view: clampView(centerOn(current, input.focusPoint, container), bounds, container), animate: true, userMoved: true }
  }
  return {
    view: input.userMoved ? clampView(current, bounds, container) : fitToView(bounds, container),
    animate: false,
    userMoved: input.userMoved,
  }
}
