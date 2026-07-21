import { describe, it, expect } from 'vitest'
import {
  type ExportSizing,
  editWidth,
  editHeight,
  editPxPerTile,
  editGridW,
  editGridH,
  matchGridToResolution,
  matchResolutionToGrid,
} from './exportControls'

const MAX = 8192

// A canonical starting state: a 2048² resolution at 24 px/tile → an 85² grid (the dialog's default).
const base = (): ExportSizing => ({
  width: 2048,
  height: 2048,
  gridW: 85,
  gridH: 85,
  pxPerTile: 24,
  approx: { px: false, gridW: true, gridH: true },
})

describe('editing the resolution', () => {
  it('holds the grid and re-derives pixels-per-tile (never the grid)', () => {
    const s = editWidth(base(), 1024, false, MAX)
    expect(s.width).toBe(1024)
    expect(s.height).toBe(2048) // held (unlinked)
    expect(s.gridW).toBe(85) // grid untouched
    expect(s.gridH).toBe(85)
    expect(s.pxPerTile).toBe(Math.round(1024 / 85)) // 12, re-derived
    expect(s.approx).toEqual({ px: true, gridW: false, gridH: false })
  })

  it('scales the other resolution dimension when the resolution chain is linked', () => {
    const s = editWidth(base(), 1024, true, MAX)
    expect(s.width).toBe(1024)
    expect(s.height).toBe(1024) // scaled to keep 1:1
    expect(s.gridW).toBe(85) // grid still held
  })

  it('editHeight re-derives px from the height axis, grid held', () => {
    const s = editHeight(base(), 1000, false, MAX)
    expect(s.height).toBe(1000)
    expect(s.width).toBe(2048)
    expect(s.gridH).toBe(85)
    expect(s.pxPerTile).toBe(Math.round(1000 / 85))
  })
})

describe('editing pixels-per-tile', () => {
  it('holds the resolution and re-derives the grid', () => {
    const s = editPxPerTile(base(), 48, MAX)
    expect(s.width).toBe(2048) // resolution held
    expect(s.height).toBe(2048)
    expect(s.gridW).toBe(Math.round(2048 / 48)) // 43
    expect(s.gridH).toBe(Math.round(2048 / 48))
    expect(s.approx).toEqual({ px: false, gridW: true, gridH: true })
  })
})

describe('editing the grid', () => {
  it('holds the resolution and re-derives pixels-per-tile', () => {
    const s = editGridW(base(), 40, false, MAX)
    expect(s.width).toBe(2048) // resolution held
    expect(s.height).toBe(2048)
    expect(s.gridW).toBe(40)
    expect(s.gridH).toBe(85) // unlinked → other count held
    expect(s.pxPerTile).toBe(Math.round(2048 / 40)) // 51, re-derived
    expect(s.approx).toEqual({ px: true, gridW: false, gridH: false })
  })

  it('scales the other grid count when the grid chain is linked', () => {
    const s = editGridH(base(), 40, true, MAX)
    expect(s.gridH).toBe(40)
    expect(s.gridW).toBe(40) // scaled to keep 1:1
    expect(s.width).toBe(2048) // resolution still held
  })
})

describe('↑ arrow — copy the resolution aspect onto the grid', () => {
  it('reshapes the grid to the resolution ratio, leaving the resolution untouched', () => {
    const s = matchGridToResolution({ ...base(), width: 1920, height: 1080 }, MAX)
    expect(s.width).toBe(1920) // resolution unchanged
    expect(s.height).toBe(1080)
    // grid now ~16:9, larger count preserved (85 was the max)
    expect(s.gridW).toBe(85)
    expect(s.gridH).toBe(Math.round(85 / (1920 / 1080))) // 48
    // grid aspect now matches resolution aspect (within rounding)
    expect(s.gridW / s.gridH).toBeCloseTo(1920 / 1080, 1)
  })

  it('handles a tall resolution (aspect < 1)', () => {
    const s = matchGridToResolution({ ...base(), width: 1080, height: 1920, gridW: 60, gridH: 40 }, MAX)
    expect(s.gridH).toBe(60) // larger count preserved on the taller axis
    expect(s.gridW).toBe(Math.round(60 * (1080 / 1920)))
    expect(s.gridW / s.gridH).toBeCloseTo(1080 / 1920, 1)
  })
})

describe('↓ arrow — copy the grid aspect onto the resolution (fills the PNG)', () => {
  it('reshapes the resolution to the grid ratio, leaving the grid untouched', () => {
    const s = matchResolutionToGrid({ ...base(), gridW: 40, gridH: 80 }, MAX)
    expect(s.gridW).toBe(40) // grid unchanged
    expect(s.gridH).toBe(80)
    // resolution now 1:2 with the longer edge (2048) preserved
    expect(s.height).toBe(2048)
    expect(s.width).toBe(1024)
    // the key property: resolution aspect == grid aspect → the tiling fills the frame, no letterbox
    expect(s.width / s.height).toBeCloseTo(40 / 80, 2)
  })

  it('produces a 1:8 resolution for a 1:8 grid (the reported lopsided case)', () => {
    const s = matchResolutionToGrid({ ...base(), gridW: 10, gridH: 80 }, MAX)
    expect(s.width).toBe(256)
    expect(s.height).toBe(2048)
    expect(s.width / s.height).toBeCloseTo(10 / 80, 3)
  })
})

describe('resolution is the anchor — only a direct edit or the ↓ arrow moves it', () => {
  const s = base()
  it('editing px/tile never moves the resolution', () => {
    const r = editPxPerTile(s, 50, MAX)
    expect(r.width).toBe(s.width)
    expect(r.height).toBe(s.height)
  })
  it('editing the grid never moves the resolution', () => {
    expect(editGridW(s, 33, true, MAX).width).toBe(s.width)
    expect(editGridH(s, 33, true, MAX).height).toBe(s.height)
  })
  it('the ↑ arrow never moves the resolution', () => {
    const r = matchGridToResolution({ ...s, width: 1600, height: 900 }, MAX)
    expect(r.width).toBe(1600)
    expect(r.height).toBe(900)
  })
  it('the ↓ arrow is the one derived path that moves the resolution', () => {
    const r = matchResolutionToGrid({ ...s, gridW: 30, gridH: 90 }, MAX)
    expect(r.width === s.width && r.height === s.height).toBe(false)
  })
})

describe('clamping', () => {
  it('keeps both axes within the ceiling and never inverts the aspect', () => {
    const s = matchResolutionToGrid({ ...base(), width: MAX, height: MAX, gridW: 10, gridH: 80 }, MAX)
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(MAX)
    expect(s.width).toBeGreaterThanOrEqual(1)
    expect(s.height).toBe(MAX) // longer edge preserved at the ceiling
    expect(s.width / s.height).toBeCloseTo(10 / 80, 2)
  })
})
