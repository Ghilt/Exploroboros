import './ExportMenu.css'
import { useEffect, useRef, useState } from 'react'
import type { Tiling } from '../tiling'
import type { TileState } from '../canvas'
import type { Traverser } from '../traverse'
import type { ColoringRule } from '../colorizer'
import type { StoredPredicate } from '../state/predicateStore'
import type { StoredTraverser } from '../state/traverserStore'
import { buildRecipe, DESKTOP_CAPS, MOBILE_CAPS } from '../export'
import type { ExportParams } from '../export/exportImage'
import { HelpButton } from './HelpButton'
import { Toggle } from './Toggle'

// The export's plane is the chosen Background — unpainted (unvisited) tiles take it, so the fractal
// sits on it (white / black / transparent). Only the edge colour (when edges are shown) is fixed here.
const PALETTE = { edge: '#000000' }

// Resolution bounds for the width/height inputs (px). Mobile backing stores cap near ~4096² (see
// MOBILE_CAPS), desktop allows more; the export sizing also enforces the hard caps if exceeded.
const MIN_RES = 64
const DESKTOP_MAX_RES = 8192
const MOBILE_MAX_RES = 4096

type Background = 'white' | 'transparent' | 'black'
const BG_COLOR: Record<Background, string | null> = { white: '#ffffff', transparent: null, black: '#000000' }

function isMobile(): boolean {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
}

type Props = {
  tilingId: string
  tiling: Tiling
  liveGridN: number
  seeds: ReadonlyArray<Traverser>
  baseOverlay: ReadonlyMap<string, TileState>
  predicates: ReadonlyArray<StoredPredicate>
  traversers: ReadonlyArray<StoredTraverser>
  coloringRules: ReadonlyArray<ColoringRule>
  // The Initial-state DSL document (auto-place lines) — embedded in the recipe and re-resolved against
  // the export grid so grid-relative seeding lands on the big grid too.
  initialState: string
  // Kick off a background export job (the dialog closes immediately; the job shows in the strip).
  onStartExport: (params: ExportParams) => void
}

export function ExportMenu({ tilingId, tiling, liveGridN, seeds, baseOverlay, predicates, traversers, coloringRules, initialState, onStartExport }: Props) {
  const [open, setOpen] = useState(false)
  // Detail is set as "pixels per tile"; the grid size (tile count) is derived from it + the resolution.
  const [pxPerTile, setPxPerTile] = useState(24)
  const [width, setWidth] = useState(2048)
  const [height, setHeight] = useState(2048)
  // Chain lock: when linked, editing one dimension scales the other to keep the aspect ratio.
  const [linked, setLinked] = useState(true)
  const [background, setBackground] = useState<Background>('black')
  const [edges, setEdges] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const mobile = isMobile()
  const maxRes = mobile ? MOBILE_MAX_RES : DESKTOP_MAX_RES
  // Floor at 1 (not MIN_RES) so a partially-typed number isn't snapped mid-entry; MIN_RES is only the
  // input's spinner hint. The export sizing caps still apply at render.
  const clampRes = (n: number) => Math.min(maxRes, Math.max(1, Math.round(n || 0)))
  const onWidth = (raw: number) => {
    const w = clampRes(raw)
    if (linked && width > 0) setHeight(clampRes(w * (height / width)))
    setWidth(w)
  }
  const onHeight = (raw: number) => {
    const h = clampRes(raw)
    if (linked && height > 0) setWidth(clampRes(h * (width / height)))
    setHeight(h)
  }

  // Close on outside tap / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Detail (tile count) is derived from px-per-tile + resolution: the tiling is square-ish and fit/
  // centred, so the smaller canvas edge sets how many tiles fit across it. Exactness isn't important.
  const gridN = Math.max(2, Math.round(Math.min(width, height) / Math.max(1, pxPerTile)))
  // Rough planning readout (no full build): tile count scales ~ (gridN/liveGridN)² like the generators.
  const estTiles = liveGridN > 0 ? Math.round(tiling.nodes.length * (gridN / liveGridN) ** 2) : tiling.nodes.length
  const heavy = estTiles > 250_000 || width * height >= 6144 * 6144

  // Fire-and-forget: build the recipe, hand the job to the Workspace (which shows it in the strip as a
  // cancelable thumbnail), and close the dialog immediately.
  const doExport = () => {
    const recipe = buildRecipe({
      tilingId,
      exportGridN: Math.max(2, Math.floor(gridN)),
      liveTiling: tiling,
      seeds,
      baseOverlay,
      predicates,
      traversers,
      coloringRules,
      initialState,
      output: { width, height, edges, background: BG_COLOR[background] },
    })
    onStartExport({ recipe, palette: PALETTE, caps: mobile ? MOBILE_CAPS : DESKTOP_CAPS })
    setOpen(false)
  }

  return (
    <div className="export-menu" ref={wrapRef}>
      <button
        type="button"
        className="canvas-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Export a high-resolution PNG"
        onClick={() => setOpen((o) => !o)}
      >
        Export
        <span className="canvas-trigger-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="export-pop" role="dialog" aria-label="Export image">
          <div className="export-head">
            <span className="export-title">Export PNG</span>
            <HelpButton title="Exporting images">
              <p>
                The export is the goal — a high-resolution fractal you can keep. It runs your walkers to
                completion on a <strong>fresh, larger grid</strong> (the interactive grid is just for
                exploring) and saves the result as a PNG.
              </p>
              <p>
                <strong>Pixels per tile</strong> is the detail — smaller tiles means more of them, so a
                bigger, finer fractal (the readout shows the rough grid it works out to).{' '}
                <strong>Resolution</strong> is the image’s pixel width × height; the{' '}
                <strong>chain</strong> keeps them in proportion (click it to set them apart). Your walkers
                keep their position relative to the centre, so the pattern grows the same — with more room.
              </p>
              <p>
                Export runs in the background — a thumbnail appears in the corner with a spinner; the X
                cancels it. The full setup is stored inside the PNG, so later you’ll be able to reopen it.
              </p>
            </HelpButton>
          </div>

          <label className="export-row">
            <span>Pixels per tile</span>
            <input
              type="number"
              min={1}
              step={1}
              value={pxPerTile}
              onChange={(e) => setPxPerTile(Math.max(1, Math.round(Number(e.target.value) || 0)))}
            />
          </label>

          <div className="export-res" role="group" aria-label="resolution (pixels)">
            <span className="export-res-label export-res-w">Width</span>
            <input
              type="number"
              className="export-res-num export-res-num-w"
              min={MIN_RES}
              max={maxRes}
              step={1}
              value={width}
              aria-label="export width in pixels"
              onChange={(e) => onWidth(Number(e.target.value))}
            />
            <button
              type="button"
              className={`export-lock${linked ? ' is-linked' : ''}`}
              aria-pressed={linked}
              aria-label={linked ? 'width and height linked — click to unlink' : 'width and height independent — click to link'}
              title={linked ? 'Linked: width and height change together' : 'Unlinked: set width and height separately'}
              onClick={() => setLinked((v) => !v)}
            >
              <LinkIcon broken={!linked} />
            </button>
            <span className="export-res-label export-res-h">Height</span>
            <input
              type="number"
              className="export-res-num export-res-num-h"
              min={MIN_RES}
              max={maxRes}
              step={1}
              value={height}
              aria-label="export height in pixels"
              onChange={(e) => onHeight(Number(e.target.value))}
            />
          </div>

          <label className="export-row">
            <span>Background</span>
            <select value={background} onChange={(e) => setBackground(e.target.value as Background)}>
              <option value="white">White</option>
              <option value="transparent">Transparent</option>
              <option value="black">Black</option>
            </select>
          </label>

          <div className="export-row">
            <span>Show tile edges</span>
            <Toggle checked={edges} onChange={setEdges} label="show tile edges" />
          </div>

          <p className="export-readout">
            grid ≈ {gridN} × {gridN} tiles · {width.toLocaleString()} × {height.toLocaleString()} px
          </p>
          {heavy && <p className="export-warn">Large export — may take a while and use a lot of memory.</p>}

          <button type="button" className="export-go" onClick={doExport}>
            Export
          </button>
        </div>
      )}
    </div>
  )
}

// The chain-lock glyph between the width/height inputs: a closed link when locked, a split (broken)
// link when the dimensions are independent.
function LinkIcon({ broken }: { broken: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
      {broken ? (
        <>
          <line x1="8" y1="12" x2="10" y2="12" />
          <line x1="14" y1="12" x2="16" y2="12" />
        </>
      ) : (
        <line x1="8" y1="12" x2="16" y2="12" />
      )}
    </svg>
  )
}
