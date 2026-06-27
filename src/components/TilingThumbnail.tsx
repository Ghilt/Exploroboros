import { useMemo } from 'react'
import type { TilingEntry } from '../data/tilings'
import { squareTiling } from '../tiling'
import { TilingDebugView } from './TilingDebugView'

// Small preview drawings for the tiling-picker gallery. `square` reuses the engine's own debug
// view (so the thumbnail matches the real render); `octagon-wedge` is a faithful static drawing
// of the prototype geometry (no engine generator yet); everything else is a placeholder.
export function TilingThumbnail({ entry }: { entry: TilingEntry }) {
  if (entry.id === 'square') return <SquareThumb />
  if (entry.id === 'octagon-wedge') return <OctagonWedgeThumb />
  return <PlaceholderThumb />
}

function SquareThumb() {
  const tiling = useMemo(() => squareTiling(6, 6), [])
  return <TilingDebugView tiling={tiling} />
}

function PlaceholderThumb() {
  return (
    <span className="tiling-card-placeholder">
      <span className="tiling-card-placeholder-mark">⬡</span>
    </span>
  )
}

// --- octagon + wedge geometry (from the prototype) ----------------------------------------
// Regular flat-top octagons on a 22.5°-rotated square lattice; concave wedges fill the gaps.
// Rendered statically for the gallery — the engine generator is a later backlog item. Wedge
// seating skips the prototype's edge-snap (a sub-pixel correction, invisible at this scale).

type Pt = { x: number; y: number }

const SQRT2 = Math.SQRT2
const OCT_R = 1 / (2 * Math.sin(Math.PI / 8)) // octagon circumradius for edge length 1
const F2F = 1 + SQRT2 // octagon flat-to-flat width

const OCTAGON: ReadonlyArray<Pt> = Array.from({ length: 8 }, (_, k) => {
  const a = ((22.5 + 45 * k) * Math.PI) / 180
  return { x: OCT_R * Math.cos(a), y: OCT_R * Math.sin(a) }
})

const WEDGE: ReadonlyArray<Pt> = [
  { x: 0, y: 0 },
  { x: SQRT2 / 2, y: SQRT2 / 2 },
  { x: 1 + SQRT2 / 2, y: SQRT2 / 2 },
  { x: 1 + SQRT2 / 2, y: 1 + SQRT2 / 2 },
  { x: SQRT2 / 2, y: 1 + SQRT2 / 2 },
  { x: 0, y: F2F },
  { x: -SQRT2 / 2, y: 1 + SQRT2 / 2 },
  { x: 0, y: 1 },
]

// Square lattice vectors (rotated 22.5°) and one repeating cell: 6 octagons + 4 wedges.
const U: Pt = { x: 3 + 2 * SQRT2, y: 1 + SQRT2 }
const V: Pt = { x: 1 + SQRT2, y: -(3 + 2 * SQRT2) }

const CELL_OCT: ReadonlyArray<Pt> = [
  { x: 0, y: 0 },
  { x: 2.41421356, y: -2.41421356 },
  { x: 3.41421356, y: 0 },
  { x: 4.12132034, y: -4.12132034 },
  { x: 5.82842712, y: 0 },
  { x: 5.82842712, y: -2.41421356 },
]

const CELL_WEDGES: ReadonlyArray<{ c: Pt; rot: number }> = [
  { c: { x: 1.61477986, y: -0.6688614 }, rot: 90 },
  { c: { x: 1.7453556, y: -4.02903007 }, rot: 0 },
  { c: { x: 4.21370349, y: -1.7453556 }, rot: 270 },
  { c: { x: 4.08312775, y: 1.61477986 }, rot: 180 },
]

function rotate(pts: ReadonlyArray<Pt>, deg: number): Pt[] {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return pts.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }))
}

function translate(pts: ReadonlyArray<Pt>, dx: number, dy: number): Pt[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

function centroid(pts: ReadonlyArray<Pt>): Pt {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const cross = p.x * q.y - q.x * p.y
    a += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  a *= 0.5
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

function seatWedge(c: Pt, rot: number): Pt[] {
  const base = rotate(WEDGE, rot)
  const cen = centroid(base)
  return translate(base, c.x - cen.x, c.y - cen.y)
}

type PatchTile = { kind: 'oct' | 'wedge'; pts: ReadonlyArray<Pt> }

// A few cells of the tiling, computed once at module load (deterministic, pure math).
const PATCH: ReadonlyArray<PatchTile> = (() => {
  const tiles: PatchTile[] = []
  for (let m = -2; m <= 2; m += 1) {
    for (let n = -2; n <= 2; n += 1) {
      const ox = m * U.x + n * V.x
      const oy = m * U.y + n * V.y
      for (const c of CELL_OCT) tiles.push({ kind: 'oct', pts: translate(OCTAGON, c.x + ox, c.y + oy) })
      for (const w of CELL_WEDGES) tiles.push({ kind: 'wedge', pts: seatWedge({ x: w.c.x + ox, y: w.c.y + oy }, w.rot) })
    }
  }
  return tiles
})()

// Window onto the central cell. y is negated when emitting points (world is y-up, SVG y-down).
const VIEW = 11
const VIEW_CX = 3.6
const VIEW_CY = 1.49 // = -(central cell centroid y), already in SVG (y-down) space

function OctagonWedgeThumb() {
  const viewBox = `${VIEW_CX - VIEW / 2} ${VIEW_CY - VIEW / 2} ${VIEW} ${VIEW}`
  return (
    <svg className="ow-thumb" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      <rect className="ow-bg" x={VIEW_CX - VIEW / 2} y={VIEW_CY - VIEW / 2} width={VIEW} height={VIEW} />
      {PATCH.map((t, i) => (
        <polygon
          key={`${t.kind}-${i}`}
          className={t.kind === 'oct' ? 'ow-oct' : 'ow-wedge'}
          points={t.pts.map((p) => `${p.x},${-p.y}`).join(' ')}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
