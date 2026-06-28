// Pick the export canvas pixel size + the transform that frames the whole tiling into it. The output
// is sized to the tiling's OWN aspect ratio (from its world bounds) so the fractal fills the PNG with
// no distortion and no wasted transparent margins — `longEdgePx` sets the longer side. Device/browser
// canvas limits are applied as a hard area + per-edge cap (a too-big canvas silently rasterises blank,
// especially on iOS), scaling the request down rather than failing. Pure (no DOM) — testable.

import type { Bounds } from '../tiling'
import { fitToView, type View, type Size } from '../canvas'

// Conservative cross-device ceilings. Mobile/Safari backing stores cap near ~16.7M px (≈4096²) and
// blank out past it; desktop engines allow far more. The caller picks which to apply.
export const DESKTOP_CAPS: SizeCaps = { maxEdge: 8192, maxArea: 8192 * 8192 }
export const MOBILE_CAPS: SizeCaps = { maxEdge: 4096, maxArea: 4096 * 4096 }

export type SizeCaps = { maxEdge: number; maxArea: number }

export type CanvasSize = {
  width: number
  height: number
  view: View
  // True when the caps forced the output smaller than requested (the UI warns + reports the real size).
  clamped: boolean
}

function aspectSize(bounds: Bounds, longEdgePx: number): Size {
  const worldW = bounds.maxX - bounds.minX
  const worldH = bounds.maxY - bounds.minY
  if (!(worldW > 0) || !(worldH > 0)) return { width: longEdgePx, height: longEdgePx }
  if (worldW >= worldH) return { width: longEdgePx, height: Math.round((longEdgePx * worldH) / worldW) }
  return { width: Math.round((longEdgePx * worldW) / worldH), height: longEdgePx }
}

export function pickCanvasSize(
  bounds: Bounds,
  longEdgePx: number,
  caps: SizeCaps,
  padFrac = 0.01,
): CanvasSize {
  const want = aspectSize(bounds, Math.max(1, Math.floor(longEdgePx)))
  // Shrink uniformly until both the per-edge and total-area caps are satisfied.
  const edgeScale = Math.min(1, caps.maxEdge / Math.max(want.width, want.height))
  const areaScale = Math.min(1, Math.sqrt(caps.maxArea / (want.width * want.height)))
  const scale = Math.min(edgeScale, areaScale)
  const width = Math.max(1, Math.floor(want.width * scale))
  const height = Math.max(1, Math.floor(want.height * scale))
  const view = fitToView(bounds, { width, height }, padFrac)
  return { width, height, view, clamped: scale < 1 }
}
