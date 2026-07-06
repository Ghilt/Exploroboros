import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld, clampScale, zoomAt, panBy, fitToView, clampView, centerOn, reframeView } from './view'
import type { View } from './view'

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x)
  expect(a.y).toBeCloseTo(b.y)
}

describe('worldToScreen / screenToWorld', () => {
  const views: View[] = [
    { scale: 1, tx: 0, ty: 0 },
    { scale: 12.5, tx: -30, ty: 200 },
    { scale: 0.3, tx: 17, ty: -4 },
  ]

  it('round-trips for any view', () => {
    for (const view of views) {
      for (const p of [{ x: 0, y: 0 }, { x: 3.5, y: -2.1 }, { x: -10, y: 8 }]) {
        close(screenToWorld(worldToScreen(p, view), view), p)
      }
    }
  })

  it('flips the y-axis (higher world y -> smaller screen y)', () => {
    const view: View = { scale: 2, tx: 0, ty: 100 }
    const low = worldToScreen({ x: 0, y: 0 }, view)
    const high = worldToScreen({ x: 0, y: 5 }, view)
    expect(high.y).toBeLessThan(low.y)
  })
})

describe('clampScale', () => {
  it('clamps into [min, max]', () => {
    expect(clampScale(5, 1, 10)).toBe(5)
    expect(clampScale(0.1, 1, 10)).toBe(1)
    expect(clampScale(99, 1, 10)).toBe(10)
  })
})

describe('zoomAt', () => {
  it('keeps the world point under the anchor fixed', () => {
    const view: View = { scale: 1, tx: 0, ty: 0 }
    const anchor = { x: 50, y: 70 }
    const next = zoomAt(view, anchor, 2, 0.1, 10)
    expect(next.scale).toBe(2)
    close(worldToScreen(screenToWorld(anchor, view), next), anchor)
  })

  it('respects scale clamps', () => {
    const view: View = { scale: 8, tx: 0, ty: 0 }
    expect(zoomAt(view, { x: 0, y: 0 }, 4, 0.5, 10).scale).toBe(10)
    expect(zoomAt(view, { x: 0, y: 0 }, 0.01, 0.5, 10).scale).toBe(0.5)
  })
})

describe('panBy', () => {
  it('shifts translation, keeps scale', () => {
    expect(panBy({ scale: 3, tx: 10, ty: 20 }, 5, -4)).toEqual({ scale: 3, tx: 15, ty: 16 })
  })
})

describe('fitToView', () => {
  it('with no padding maps the bounds corners to the container corners', () => {
    const view = fitToView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 100, height: 100 }, 0)
    expect(view.scale).toBeCloseTo(10)
    close(worldToScreen({ x: 0, y: 0 }, view), { x: 0, y: 100 }) // world bottom-left -> screen bottom-left
    close(worldToScreen({ x: 10, y: 10 }, view), { x: 100, y: 0 }) // world top-right -> screen top-right
  })

  it('centers a padded tiling inside a non-square container', () => {
    const c = { width: 200, height: 100 }
    const view = fitToView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, c)
    const center = worldToScreen({ x: 5, y: 5 }, view)
    close(center, { x: c.width / 2, y: c.height / 2 })
    // contained: every corner lands within the container
    for (const p of [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }]) {
      const s = worldToScreen(p, view)
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(c.width)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(c.height)
    }
  })

  it('degrades gracefully on a zero-size container', () => {
    expect(fitToView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 0, height: 0 })).toEqual({
      scale: 1,
      tx: 0,
      ty: 0,
    })
  })
})

describe('centerOn', () => {
  it('maps the given point to the container centre, keeping scale fixed', () => {
    const view: View = { scale: 3, tx: 40, ty: -12 }
    const container = { width: 300, height: 200 }
    const out = centerOn(view, { x: 7, y: -2 }, container)
    expect(out.scale).toBe(view.scale)
    close(worldToScreen({ x: 7, y: -2 }, out), { x: 150, y: 100 })
  })
})

describe('clampView', () => {
  const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
  const container = { width: 100, height: 100 }

  it('centers content smaller than the viewport', () => {
    const out = clampView({ scale: 2, tx: 0, ty: 0 }, bounds, container)
    const center = worldToScreen({ x: 5, y: 5 }, out)
    close(center, { x: 50, y: 50 })
  })

  it('leaves no empty gap when content is larger than the viewport', () => {
    const out = clampView({ scale: 20, tx: 0, ty: 0 }, bounds, container)
    const tl = worldToScreen({ x: bounds.minX, y: bounds.maxY }, out)
    const br = worldToScreen({ x: bounds.maxX, y: bounds.minY }, out)
    expect(tl.x).toBeLessThanOrEqual(0)
    expect(tl.y).toBeLessThanOrEqual(0)
    expect(br.x).toBeGreaterThanOrEqual(container.width)
    expect(br.y).toBeGreaterThanOrEqual(container.height)
  })
})

describe('reframeView', () => {
  const bounds = { minX: 0, minY: 0, maxX: 20, maxY: 20 }

  it('a new Fit wins over any focus point or userMoved state', () => {
    const container = { width: 300, height: 200 }
    const current: View = { scale: 50, tx: 999, ty: -999 }
    const out = reframeView(current, bounds, container, { isNewFit: true, focusPoint: { x: 5, y: 5 }, userMoved: true })
    expect(out.animate).toBe(false)
    expect(out.userMoved).toBe(false)
    expect(out.view).toEqual(fitToView(bounds, container))
  })

  it('centres and animates toward a focus point, clamped to bounds', () => {
    const container = { width: 300, height: 200 }
    const current: View = { scale: 10, tx: 0, ty: 0 }
    const focus = { x: 10, y: 10 }
    const out = reframeView(current, bounds, container, { isNewFit: false, focusPoint: focus, userMoved: false })
    expect(out.animate).toBe(true)
    expect(out.userMoved).toBe(true)
    expect(out.view).toEqual(clampView(centerOn(current, focus, container), bounds, container))
  })

  it('falls back to a plain clamp with no focus once the user has navigated', () => {
    const container = { width: 300, height: 200 }
    const current: View = { scale: 10, tx: 5, ty: 5 }
    const out = reframeView(current, bounds, container, { isNewFit: false, focusPoint: null, userMoved: true })
    expect(out.animate).toBe(false)
    expect(out.userMoved).toBe(true)
    expect(out.view).toEqual(clampView(current, bounds, container))
  })

  it('falls back to a fresh fit with no focus and no prior manual navigation', () => {
    const container = { width: 300, height: 200 }
    const current: View = { scale: 10, tx: 5, ty: 5 }
    const out = reframeView(current, bounds, container, { isNewFit: false, focusPoint: null, userMoved: false })
    expect(out.animate).toBe(false)
    expect(out.userMoved).toBe(false)
    expect(out.view).toEqual(fitToView(bounds, container))
  })

  it('keeps a followed tile centred across a resize that narrows the container (the pane-opening regression)', () => {
    // Reproduces the reported bug: selecting a tile opens a side pane that narrows the canvas out
    // from under it. Zoom into a wide container, "select" a tile comfortably off-centre, then
    // reframe again for a narrower container (same focus point, no Fit, no manual pan in between —
    // exactly what happens when the Inspect pane opens right after the tap) and check it's still
    // centred rather than stranded behind where the pane now sits.
    const wide = { width: 1000, height: 800 }
    const narrow = { width: 500, height: 800 } // as if a ~500px pane just opened on the right
    const fitted = fitToView(bounds, wide)
    const zoomed: View = { scale: fitted.scale * 3, tx: 0, ty: 0 } // some zoomed-in starting view
    const focus = { x: 12, y: 10 } // off-centre, but with enough margin not to hit the clamp

    const afterSelect = reframeView(zoomed, bounds, wide, { isNewFit: false, focusPoint: focus, userMoved: true })
    close(worldToScreen(focus, afterSelect.view), { x: wide.width / 2, y: wide.height / 2 })

    const afterResize = reframeView(afterSelect.view, bounds, narrow, { isNewFit: false, focusPoint: focus, userMoved: true })
    close(worldToScreen(focus, afterResize.view), { x: narrow.width / 2, y: narrow.height / 2 })
  })

  it('a plain resize with no focus point does NOT recentre — it only prevents blank margin', () => {
    // The counterpart to the regression test above: once there's no tile to follow (deselected, or
    // the user has since panned away), a resize must not silently re-centre on stale state.
    const wide = { width: 1000, height: 800 }
    const narrow = { width: 500, height: 800 }
    const zoomed: View = { scale: fitToView(bounds, wide).scale * 3, tx: -400, ty: -100 }
    const out = reframeView(zoomed, bounds, narrow, { isNewFit: false, focusPoint: null, userMoved: true })
    expect(out.view).toEqual(clampView(zoomed, bounds, narrow))
  })
})
