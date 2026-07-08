import './ExportMenu.css'
import { useEffect, useRef, useState } from 'react'
import type { Tiling, NumberingScheme } from '../tiling'
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
const DEFAULT_PX_PER_TILE = 24
const DEFAULT_RES = 2048

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
  // The board numbering scheme in force — embedded so find-lowest/highest-tile reproduces its search.
  numberingScheme: NumberingScheme
  // Kick off a background export job (the dialog closes immediately; the job shows in the strip).
  onStartExport: (params: ExportParams) => void
}

export function ExportMenu({ tilingId, tiling, liveGridN, seeds, baseOverlay, predicates, traversers, coloringRules, initialState, numberingScheme, onStartExport }: Props) {
  const [open, setOpen] = useState(false)
  const [pxPerTile, setPxPerTile] = useState(DEFAULT_PX_PER_TILE)
  const [width, setWidth] = useState(DEFAULT_RES)
  const [height, setHeight] = useState(DEFAULT_RES)
  // The output Resolution is the ANCHOR: it changes ONLY when the user edits it, and never carries a ~
  // (its own chain keeps width:height in proportion). Pixels-per-tile and grid width/height are two ways
  // to express the SAME thing — how finely to tile that fixed resolution (grid ≈ resolution ÷ px). Edit
  // either and the OTHER re-derives; `approx` marks whichever of {px, gridW, gridH} is that derived guess
  // (shown as ~), never the resolution. The grid chain (`gridLinked`) just makes gridW and gridH follow
  // each other — it does not touch the resolution.
  const [gridW, setGridW] = useState(() => Math.max(1, Math.round(DEFAULT_RES / DEFAULT_PX_PER_TILE)))
  const [gridH, setGridH] = useState(() => Math.max(1, Math.round(DEFAULT_RES / DEFAULT_PX_PER_TILE)))
  const [approx, setApprox] = useState({ px: false, gridW: true, gridH: true })
  const [gridLinked, setGridLinked] = useState(true)
  // Chain lock for the pixel resolution: when linked, editing one dimension scales the other by ratio.
  const [linked, setLinked] = useState(true)
  const [background, setBackground] = useState<Background>('black')
  const [edges, setEdges] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const mobile = isMobile()
  const maxRes = mobile ? MOBILE_MAX_RES : DESKTOP_MAX_RES
  // Floor at 1 (not MIN_RES) so a partially-typed number isn't snapped mid-entry; MIN_RES is only the
  // input's spinner hint. Grid counts share the same ceiling so a typo can't build a runaway tiling.
  const clampRes = (n: number) => Math.min(maxRes, Math.max(1, Math.round(n || 0)))
  const clampCount = (n: number) => Math.min(maxRes, Math.max(1, Math.round(n || 0)))

  // Editing the resolution is the ONLY thing that moves the pixel size. It re-derives the grid at the
  // current pixels-per-tile (grid marked ~); px stays the exact anchor. The res lock scales the other dim.
  const onWidth = (raw: number) => {
    const w = clampRes(raw)
    setWidth(w)
    setGridW(clampCount(w / pxPerTile))
    if (linked && width > 0) {
      const h = clampRes(w * (height / width))
      setHeight(h)
      setGridH(clampCount(h / pxPerTile))
      setApprox({ px: false, gridW: true, gridH: true })
    } else {
      setApprox((a) => ({ ...a, px: false, gridW: true }))
    }
  }
  const onHeight = (raw: number) => {
    const h = clampRes(raw)
    setHeight(h)
    setGridH(clampCount(h / pxPerTile))
    if (linked && height > 0) {
      const w = clampRes(h * (width / height))
      setWidth(w)
      setGridW(clampCount(w / pxPerTile))
      setApprox({ px: false, gridW: true, gridH: true })
    } else {
      setApprox((a) => ({ ...a, px: false, gridH: true }))
    }
  }
  // Pixels-per-tile and the grid are two views of the same fit into the FIXED resolution: editing the
  // tile size re-derives both grid counts (grid ~), and never moves the resolution.
  const onPxPerTile = (raw: number) => {
    const px = Math.max(1, Math.round(raw || 0))
    setPxPerTile(px)
    setGridW(clampCount(width / px))
    setGridH(clampCount(height / px))
    setApprox({ px: false, gridW: true, gridH: true })
  }
  // A grid dimension is an exact tile count for the fixed resolution; pixels-per-tile re-derives (~) and
  // the resolution is untouched. With the grid lock on, the OTHER grid dimension follows to keep the ratio.
  const onGridW = (raw: number) => {
    const gw = clampCount(raw)
    setGridW(gw)
    setPxPerTile(Math.max(1, Math.round(width / gw)))
    if (gridLinked && gridW > 0) {
      setGridH(clampCount(gw * (gridH / gridW)))
      setApprox({ px: true, gridW: false, gridH: false })
    } else {
      setApprox((a) => ({ ...a, px: true, gridW: false }))
    }
  }
  const onGridH = (raw: number) => {
    const gh = clampCount(raw)
    setGridH(gh)
    setPxPerTile(Math.max(1, Math.round(height / gh)))
    if (gridLinked && gridH > 0) {
      setGridW(clampCount(gh * (gridW / gridH)))
      setApprox({ px: true, gridW: false, gridH: false })
    } else {
      setApprox((a) => ({ ...a, px: true, gridH: false }))
    }
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

  // Rough planning readout (no full build): tile count scales with the area ratio vs. the live grid.
  const estTiles = liveGridN > 0 ? Math.round(tiling.nodes.length * (gridW / liveGridN) * (gridH / liveGridN)) : tiling.nodes.length
  const heavy = estTiles > 250_000 || width * height >= 6144 * 6144

  // Fire-and-forget: build the recipe, hand the job to the Workspace (which shows it in the strip as a
  // cancelable thumbnail), and close the dialog immediately.
  const doExport = () => {
    const recipe = buildRecipe({
      tilingId,
      exportGridW: Math.max(2, Math.floor(gridW)),
      exportGridH: Math.max(2, Math.floor(gridH)),
      liveTiling: tiling,
      seeds,
      baseOverlay,
      predicates,
      traversers,
      coloringRules,
      initialState,
      numberingScheme,
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
                <strong>Resolution</strong> is the image’s pixel size — the fixed canvas you’re filling. It
                only changes when you edit it; its <strong>chain</strong> keeps width and height in
                proportion.
              </p>
              <p>
                <strong>Pixels per tile</strong> and <strong>Grid width/height</strong> are two ways to say
                how finely to tile that canvas: set the tile size, or set the tile counts directly for an
                exact (even or uneven) grid. Editing one re-derives the other, which then shows a{' '}
                <strong>~</strong>. The grid’s own <strong>chain</strong> keeps its width and height in the
                same ratio. Only the square tiling can truly go rectangular; other tilings average the two
                into one size.
              </p>
              <p>
                Export runs in the background — a thumbnail appears in the corner with a spinner; the X
                cancels it. The full setup is stored inside the PNG, so later you’ll be able to reopen it.
              </p>
            </HelpButton>
          </div>

          <label className="export-row">
            <span>
              Pixels per tile
              {approx.px && (
                <span className="export-approx" title="Approximate — derived from the grid size">
                  ~
                </span>
              )}
            </span>
            <input type="number" min={1} step={1} value={pxPerTile} onChange={(e) => onPxPerTile(Number(e.target.value))} />
          </label>

          <div className="export-res export-grid" role="group" aria-label="grid size (tiles)">
            <span className="export-res-label export-res-w">
              Grid width
              {approx.gridW && (
                <span className="export-approx" title="Approximate — the count that fits the resolution at this tile size">
                  ~
                </span>
              )}
            </span>
            <input
              type="number"
              className="export-res-num export-res-num-w"
              min={1}
              step={1}
              value={gridW}
              aria-label={`grid width in tiles${approx.gridW ? ' (approximate)' : ''}`}
              onChange={(e) => onGridW(Number(e.target.value))}
            />
            <button
              type="button"
              className={`export-lock${gridLinked ? ' is-linked' : ''}`}
              aria-pressed={gridLinked}
              aria-label={gridLinked ? 'grid width and height linked — click to unlink' : 'grid width and height independent — click to link'}
              title={gridLinked ? 'Linked: grid width and height change together' : 'Unlinked: set grid width and height separately'}
              onClick={() => setGridLinked((v) => !v)}
            >
              <LinkIcon broken={!gridLinked} />
            </button>
            <span className="export-res-label export-res-h">
              Grid height
              {approx.gridH && (
                <span className="export-approx" title="Approximate — the count that fits the resolution at this tile size">
                  ~
                </span>
              )}
            </span>
            <input
              type="number"
              className="export-res-num export-res-num-h"
              min={1}
              step={1}
              value={gridH}
              aria-label={`grid height in tiles${approx.gridH ? ' (approximate)' : ''}`}
              onChange={(e) => onGridH(Number(e.target.value))}
            />
          </div>

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
