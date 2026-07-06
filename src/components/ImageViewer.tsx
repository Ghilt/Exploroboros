import './ImageViewer.css'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// A zoom/pan viewer for an exported PNG — replaces the live canvas when a thumbnail is opened. Plain
// CSS transform on an <img> (no Konva): wheel zooms toward the cursor, drag pans, double-click refits.

type Transform = { scale: number; x: number; y: number }

const MIN_SCALE = 0.1
const MAX_SCALE = 40

export function ImageViewer({ src }: { src: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [t, setT] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  // Fit the image into the host (contain + centre). Runs on load and on double-click / resize.
  // Stable (only refs + setT inside) so it can sit in effect deps without re-subscribing.
  const fit = useCallback(() => {
    const host = hostRef.current
    const img = imgRef.current
    if (!host || !img || !img.naturalWidth) return
    const r = host.getBoundingClientRect()
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
    setT({ scale, x: (r.width - img.naturalWidth * scale) / 2, y: (r.height - img.naturalHeight * scale) / 2 })
  }, [])

  // Refit when the source changes (a different export opened, or this viewer just mounted into
  // whatever size the canvas pane is right now — e.g. narrower because a side pane is open). Layout
  // effect so it's sized before the browser paints — no frame at the wrong scale.
  useLayoutEffect(() => {
    fit()
  }, [src, fit])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(host)
    return () => ro.disconnect()
  }, [fit])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const host = hostRef.current
    if (!host) return
    const r = host.getBoundingClientRect()
    const cx = e.clientX - r.left
    const cy = e.clientY - r.top
    setT((cur) => {
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cur.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
      const k = ns / cur.scale
      return { scale: ns, x: cx - k * (cx - cur.x), y: cy - k * (cy - cur.y) }
    })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    setT((cur) => ({ ...cur, x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    drag.current = null
  }

  return (
    <div
      className="image-viewer"
      ref={hostRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={fit}
      title="Scroll to zoom · drag to pan · double-click to fit"
    >
      <img
        ref={imgRef}
        src={src}
        alt="Exported pattern"
        draggable={false}
        onLoad={fit}
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transformOrigin: '0 0' }}
      />
    </div>
  )
}
