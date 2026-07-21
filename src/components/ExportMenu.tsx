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
import {
  type ExportSizing,
  editWidth,
  editHeight,
  editPxPerTile,
  editGridW,
  editGridH,
  matchGridToResolution,
  matchResolutionToGrid,
} from '../export/exportControls'
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
  // Resolution / grid / pixels-per-tile are three coupled views of the render size. The interdependency
  // rules — which value gives way on each edit, and the two arrows that transfer aspect ratio between the
  // grid and resolution — live in the pure, unit-tested src/export/exportControls.ts. Resolution is the
  // ANCHOR: only a direct edit or the ↓ arrow moves it; `approx` marks whichever readout is currently a
  // derived guess (~). The grid/resolution chains just keep each block's own width:height in proportion.
  const [sz, setSz] = useState<ExportSizing>(() => {
    const g = Math.max(1, Math.round(DEFAULT_RES / DEFAULT_PX_PER_TILE))
    return { width: DEFAULT_RES, height: DEFAULT_RES, gridW: g, gridH: g, pxPerTile: DEFAULT_PX_PER_TILE, approx: { px: false, gridW: true, gridH: true } }
  })
  const [gridLinked, setGridLinked] = useState(true)
  // Chain lock for the pixel resolution: when linked, editing one dimension scales the other by ratio.
  const [linked, setLinked] = useState(true)
  const [background, setBackground] = useState<Background>('black')
  const [edges, setEdges] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const mobile = isMobile()
  const maxRes = mobile ? MOBILE_MAX_RES : DESKTOP_MAX_RES

  // All the edit rules live in the pure module (see its header). Editing the resolution re-derives px
  // (grid held); editing px re-derives the grid (resolution held); editing the grid re-derives px
  // (resolution held). The two arrows transfer aspect ratio between the grid and resolution blocks.
  const onWidth = (raw: number) => setSz((s) => editWidth(s, raw, linked, maxRes))
  const onHeight = (raw: number) => setSz((s) => editHeight(s, raw, linked, maxRes))
  const onPxPerTile = (raw: number) => setSz((s) => editPxPerTile(s, raw, maxRes))
  const onGridW = (raw: number) => setSz((s) => editGridW(s, raw, gridLinked, maxRes))
  const onGridH = (raw: number) => setSz((s) => editGridH(s, raw, gridLinked, maxRes))
  const onCopyResToGrid = () => setSz((s) => matchGridToResolution(s, maxRes)) // ↑ grid ← resolution aspect
  const onCopyGridToRes = () => setSz((s) => matchResolutionToGrid(s, maxRes)) // ↓ resolution ← grid aspect

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
  const estTiles = liveGridN > 0 ? Math.round(tiling.nodes.length * (sz.gridW / liveGridN) * (sz.gridH / liveGridN)) : tiling.nodes.length
  const heavy = estTiles > 250_000 || sz.width * sz.height >= 6144 * 6144

  // Fire-and-forget: build the recipe, hand the job to the Workspace (which shows it in the strip as a
  // cancelable thumbnail), and close the dialog immediately.
  const doExport = () => {
    const recipe = buildRecipe({
      tilingId,
      exportGridW: Math.max(2, Math.floor(sz.gridW)),
      exportGridH: Math.max(2, Math.floor(sz.gridH)),
      liveTiling: tiling,
      seeds,
      baseOverlay,
      predicates,
      traversers,
      coloringRules,
      initialState,
      numberingScheme,
      output: { width: sz.width, height: sz.height, edges, background: BG_COLOR[background] },
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
                only moves when you edit it directly (or use the ↓ arrow below); its <strong>chain</strong>{' '}
                keeps width and height in proportion.
              </p>
              <p>
                <strong>Grid width/height</strong> is the tile count, and <strong>Pixels per tile</strong> is
                the resulting tile size — the two together fit into that fixed resolution. Edit the grid or
                the tile size and the other re-derives (shown with a <strong>~</strong>); edit the resolution
                and the tile size re-derives. The grid and resolution are otherwise independent.
              </p>
              <p>
                The <strong>↑ / ↓ arrows</strong> between them copy an aspect ratio across: <strong>↓</strong>{' '}
                reshapes the resolution to match your grid — so a hand-tuned grid drops into the PNG with no
                empty margins — and <strong>↑</strong> reshapes the grid to match the resolution. (The square
                tiling uses your exact counts; other tilings are cropped to the frame’s shape either way.)
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
              {sz.approx.px && (
                <span className="export-approx" title="Approximate — derived from the grid size">
                  ~
                </span>
              )}
            </span>
            <input type="number" min={1} step={1} value={sz.pxPerTile} onChange={(e) => onPxPerTile(Number(e.target.value))} />
          </label>

          <div className="export-res export-grid" role="group" aria-label="grid size (tiles)">
            <span className="export-res-label export-res-w">
              Grid width
              {sz.approx.gridW && (
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
              value={sz.gridW}
              aria-label={`grid width in tiles${sz.approx.gridW ? ' (approximate)' : ''}`}
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
              {sz.approx.gridH && (
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
              value={sz.gridH}
              aria-label={`grid height in tiles${sz.approx.gridH ? ' (approximate)' : ''}`}
              onChange={(e) => onGridH(Number(e.target.value))}
            />
          </div>

          {/* Transfer aspect ratio between the grid (above) and resolution (below). ↑ reshapes the grid to
              the resolution's ratio; ↓ reshapes the resolution to the grid's ratio (fills the PNG neatly).
              Aligned to the same middle column as the two chain-locks. */}
          <div className="export-transfer" role="group" aria-label="transfer aspect ratio">
            <div className="export-arrows">
              <button
                type="button"
                className="export-lock export-arrow"
                title="Copy the resolution’s aspect ratio to the grid"
                aria-label="reshape the grid to match the resolution’s aspect ratio"
                onClick={onCopyResToGrid}
              >
                <ArrowIcon dir="up" />
              </button>
              <button
                type="button"
                className="export-lock export-arrow"
                title="Copy the grid’s aspect ratio to the resolution — fits the grid into the PNG with no empty space"
                aria-label="reshape the resolution to match the grid’s aspect ratio"
                onClick={onCopyGridToRes}
              >
                <ArrowIcon dir="down" />
              </button>
            </div>
          </div>

          <div className="export-res" role="group" aria-label="resolution (pixels)">
            <span className="export-res-label export-res-w">Width</span>
            <input
              type="number"
              className="export-res-num export-res-num-w"
              min={MIN_RES}
              max={maxRes}
              step={1}
              value={sz.width}
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
              value={sz.height}
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

// The aspect-ratio transfer arrows between the grid and resolution blocks — a single chevron pointing
// up (copy the resolution's ratio onto the grid) or down (copy the grid's ratio onto the resolution).
function ArrowIcon({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'up' ? <path d="M6 14l6-6 6 6" /> : <path d="M6 10l6 6 6-6" />}
    </svg>
  )
}

// The chain-lock glyph between the width/height inputs: a closed link when locked, a split (broken)
// link when the dimensions are independent.
function LinkIcon({ broken }: { broken: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
