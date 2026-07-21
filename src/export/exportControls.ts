// The Export dialog's three coupled views of "how big to render": Resolution (output pixels W×H),
// Grid (tile counts W×H), and Pixels-per-tile (one scalar bridge, ≈ resolution ÷ grid). This module is
// the pure interdependency math — no DOM, so the tricky "editing X moves Y, holds Z" rules are
// unit-tested instead of tangled in the component.
//
// The rules (owner's spec):
//   • Resolution is the ANCHOR. It moves ONLY on a direct edit OR the down-arrow (which copies the
//     grid's aspect onto it). Nothing else touches it.
//   • Editing the resolution re-derives pixels-per-tile (the grid is held).
//   • Editing pixels-per-tile re-derives the grid (the resolution is held).
//   • Editing the grid re-derives pixels-per-tile (the resolution is held).
//   • Grid and resolution are otherwise INDEPENDENT — they may carry different aspect ratios. The two
//     arrows explicitly transfer one's aspect ratio to the other, so a hand-tuned grid drops neatly
//     into the PNG with no letterboxing (buildTiling crops non-square tilings to the grid's aspect,
//     and pickCanvasSize then fills a matching-aspect canvas).

export type ExportSizing = {
  width: number // output resolution, pixels
  height: number
  gridW: number // tile counts
  gridH: number
  pxPerTile: number
  // Which readouts are currently DERIVED (shown with a "~") rather than the user's exact input.
  approx: { px: boolean; gridW: boolean; gridH: boolean }
}

// Floor at 1 (not the input's MIN_RES) so a half-typed number isn't snapped mid-entry; `maxN` is the
// shared ceiling for both pixel dimensions and tile counts (a typo can't build a runaway tiling).
const clamp = (n: number, maxN: number): number => Math.min(maxN, Math.max(1, Math.round(n || 0)))

// Pixels-per-tile on one axis: resolution pixels ÷ tile count. A single scalar, so when the grid and
// resolution aspects differ it's only approximate (hence the "~"); we read it off the axis just edited.
const derivePx = (resAxis: number, gridAxis: number): number => Math.max(1, Math.round(resAxis / gridAxis))

// px is the derived readout after touching the resolution / grid / an arrow; the grid is exact.
const PX_DERIVED = { px: true, gridW: false, gridH: false }
// the grid is the derived readout after touching pixels-per-tile; px is exact.
const GRID_DERIVED = { px: false, gridW: true, gridH: true }

// Editing the resolution width holds the grid and re-derives px. `linked` scales the height to keep the
// resolution's own W:H ratio (its chain-lock).
export function editWidth(s: ExportSizing, raw: number, linked: boolean, maxRes: number): ExportSizing {
  const width = clamp(raw, maxRes)
  const height = linked && s.width > 0 ? clamp(width * (s.height / s.width), maxRes) : s.height
  return { ...s, width, height, pxPerTile: derivePx(width, s.gridW), approx: PX_DERIVED }
}

export function editHeight(s: ExportSizing, raw: number, linked: boolean, maxRes: number): ExportSizing {
  const height = clamp(raw, maxRes)
  const width = linked && s.height > 0 ? clamp(height * (s.width / s.height), maxRes) : s.width
  return { ...s, width, height, pxPerTile: derivePx(height, s.gridH), approx: PX_DERIVED }
}

// Editing pixels-per-tile holds the resolution and re-derives both grid counts.
export function editPxPerTile(s: ExportSizing, raw: number, maxRes: number): ExportSizing {
  const pxPerTile = Math.max(1, Math.round(raw || 0))
  return { ...s, pxPerTile, gridW: clamp(s.width / pxPerTile, maxRes), gridH: clamp(s.height / pxPerTile, maxRes), approx: GRID_DERIVED }
}

// Editing a grid count holds the resolution and re-derives px. `linked` scales the other count (the
// grid's own chain-lock).
export function editGridW(s: ExportSizing, raw: number, linked: boolean, maxRes: number): ExportSizing {
  const gridW = clamp(raw, maxRes)
  const gridH = linked && s.gridW > 0 ? clamp(gridW * (s.gridH / s.gridW), maxRes) : s.gridH
  return { ...s, gridW, gridH, pxPerTile: derivePx(s.width, gridW), approx: PX_DERIVED }
}

export function editGridH(s: ExportSizing, raw: number, linked: boolean, maxRes: number): ExportSizing {
  const gridH = clamp(raw, maxRes)
  const gridW = linked && s.gridH > 0 ? clamp(gridH * (s.gridW / s.gridH), maxRes) : s.gridW
  return { ...s, gridW, gridH, pxPerTile: derivePx(s.height, gridH), approx: PX_DERIVED }
}

// UP arrow — copy the RESOLUTION's aspect ratio onto the GRID (resolution untouched). Preserves the
// grid's larger count and reshapes the other axis to the resolution's W:H; px re-derives. The larger
// axis stays put, so neither count exceeds the count it started from.
export function matchGridToResolution(s: ExportSizing, maxRes: number): ExportSizing {
  const aspect = s.height > 0 ? s.width / s.height : 1
  const g = Math.max(s.gridW, s.gridH)
  const gridW = clamp(aspect >= 1 ? g : g * aspect, maxRes)
  const gridH = clamp(aspect >= 1 ? g / aspect : g, maxRes)
  return { ...s, gridW, gridH, pxPerTile: derivePx(s.width, gridW), approx: PX_DERIVED }
}

// DOWN arrow — copy the GRID's aspect ratio onto the RESOLUTION (the one thing besides a direct edit
// that moves the resolution). Preserves the resolution's longer edge and reshapes the other to the
// grid's W:H, so the grid fills the PNG with no unused space; px re-derives.
export function matchResolutionToGrid(s: ExportSizing, maxRes: number): ExportSizing {
  const aspect = s.gridH > 0 ? s.gridW / s.gridH : 1
  const m = Math.max(s.width, s.height)
  const width = clamp(aspect >= 1 ? m : m * aspect, maxRes)
  const height = clamp(aspect >= 1 ? m / aspect : m, maxRes)
  return { ...s, width, height, pxPerTile: derivePx(width, s.gridW), approx: PX_DERIVED }
}
