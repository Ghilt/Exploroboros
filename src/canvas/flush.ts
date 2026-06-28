// Helpers for FLUSH tile rendering (no visible seams when edges are off). The seam problem: two
// adjacent anti-aliased polygon fills only partially cover their shared boundary pixels, and sequential
// alpha-compositing lets a sliver of the background bleed through — a faint outline around every tile,
// even between same-coloured ones. The fix used by drawTiles (live) and renderTiling (export):
//   1) fill each tile with its FLATTENED OPAQUE colour (so overlaps don't darken / leak), and
//   2) inflate each polygon a hair so neighbours OVERLAP — the later fill fully covers the seam.
// Pure & isomorphic (no DOM/Konva).

import type { Vec2 } from '../tiling'

// How far (output px) to push each vertex outward. ~0.5·this lands past a tile edge for typical
// shapes — enough to swallow the ~1px anti-alias seam, small enough to be visually imperceptible.
export const FLUSH_OVERLAP_PX = 1.2

type Rgba = { r: number; g: number; b: number; a: number }

function parseColor(c: string): Rgba {
  const s = c.trim()
  if (s[0] === '#') {
    let h = s.slice(1)
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    const n = Number.parseInt(h, 16)
    if (h.length !== 6 || Number.isNaN(n)) return { r: 0, g: 0, b: 0, a: 1 }
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 }
  }
  const m = s.match(/rgba?\(([^)]+)\)/i)
  if (m) {
    const p = m[1].split(',').map((x) => Number.parseFloat(x))
    return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p[3] === undefined ? 1 : p[3] }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

// Composite a (possibly translucent) `over` colour onto an OPAQUE `base`, returning an opaque
// `rgb(r, g, b)` — the tile's visible colour, flattened so it can fill + overlap neighbours without
// darkening or letting the background show at seams. `over` undefined → just the base.
export function flattenColor(over: string | undefined, base: string): string {
  const b = parseColor(base)
  if (!over) return `rgb(${b.r}, ${b.g}, ${b.b})`
  const o = parseColor(over)
  const a = o.a < 0 ? 0 : o.a > 1 ? 1 : o.a
  const r = Math.round(o.r * a + b.r * (1 - a))
  const g = Math.round(o.g * a + b.g * (1 - a))
  const bl = Math.round(o.b * a + b.b * (1 - a))
  return `rgb(${r}, ${g}, ${bl})`
}

// Push every vertex radially out from the centroid by `delta` world units, so the tile grows a hair and
// overlaps its neighbours. `delta <= 0` returns the vertices unchanged. A degenerate vertex sitting on
// the centroid is left as-is (no direction to push).
export function inflatePolygon(verts: ReadonlyArray<Vec2>, centroid: Vec2, delta: number): Vec2[] {
  if (!(delta > 0)) return verts.map((v) => ({ x: v.x, y: v.y }))
  return verts.map((v) => {
    const dx = v.x - centroid.x
    const dy = v.y - centroid.y
    const len = Math.hypot(dx, dy)
    if (len === 0) return { x: v.x, y: v.y }
    const k = (len + delta) / len
    return { x: centroid.x + dx * k, y: centroid.y + dy * k }
  })
}
