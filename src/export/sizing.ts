// Pick the export canvas pixel size + the transform that frames the whole tiling into it. The output
// is an explicit WIDTH × HEIGHT the caller chose; the tiling (its own aspect) is fit/centred into it
// with no distortion (a mismatched aspect letterboxes onto the background). Device/browser canvas
// limits are applied as a hard area + per-edge cap (a too-big canvas silently rasterises blank,
// especially on iOS), scaling the request down — preserving its aspect — rather than failing. Pure
// (no DOM) — testable.

import type { Bounds } from '../tiling'
import { fitToView, type View } from '../canvas'

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

// The pixel size the caps allow for a requested width × height — the part of pickCanvasSize that does
// NOT need the tiling's bounds. Shrinks uniformly (keeping the requested aspect) until both the
// per-edge and area caps are met. Exposed on its own so a debug log can report the real output size a
// failed export would have used without having to (re)build the tiling.
export function clampResolution(
  reqWidth: number,
  reqHeight: number,
  caps: SizeCaps,
): { width: number; height: number; clamped: boolean } {
  const w0 = Math.max(1, Math.floor(reqWidth))
  const h0 = Math.max(1, Math.floor(reqHeight))
  const edgeScale = Math.min(1, caps.maxEdge / Math.max(w0, h0))
  const areaScale = Math.min(1, Math.sqrt(caps.maxArea / (w0 * h0)))
  const scale = Math.min(edgeScale, areaScale)
  return { width: Math.max(1, Math.floor(w0 * scale)), height: Math.max(1, Math.floor(h0 * scale)), clamped: scale < 1 }
}

export function pickCanvasSize(
  bounds: Bounds,
  reqWidth: number,
  reqHeight: number,
  caps: SizeCaps,
  padFrac = 0.01,
): CanvasSize {
  const { width, height, clamped } = clampResolution(reqWidth, reqHeight, caps)
  // Fit/centre the tiling into the canvas (contain); a mismatched aspect letterboxes onto the background.
  const view = fitToView(bounds, { width, height }, padFrac)
  return { width, height, view, clamped }
}
