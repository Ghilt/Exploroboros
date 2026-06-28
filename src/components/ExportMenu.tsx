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

// Resolution presets (long edge, px). The prototype's go-to was 3200. Mobile is capped lower (see
// MOBILE_CAPS) — bigger presets are hidden there.
const RES_PRESETS = [1024, 2048, 3200, 4096, 8192] as const
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
  // Kick off a background export job (the dialog closes immediately; the job shows in the strip).
  onStartExport: (params: ExportParams) => void
}

export function ExportMenu({ tilingId, tiling, liveGridN, seeds, baseOverlay, predicates, traversers, coloringRules, onStartExport }: Props) {
  const [open, setOpen] = useState(false)
  const [gridN, setGridN] = useState(liveGridN)
  const [longEdge, setLongEdge] = useState<number>(3200)
  const [background, setBackground] = useState<Background>('white')
  const [edges, setEdges] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const mobile = isMobile()
  const resOptions = RES_PRESETS.filter((r) => !mobile || r <= MOBILE_MAX_RES)

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

  // Rough planning readout (no full build): tile count scales ~ (gridN/liveGridN)² like the generators,
  // and the long edge spans ~gridN tiles, so px/tile ≈ longEdge / gridN.
  const estTiles = liveGridN > 0 ? Math.round(tiling.nodes.length * (gridN / liveGridN) ** 2) : tiling.nodes.length
  const pxPerTile = gridN > 0 ? longEdge / gridN : 0
  const heavy = estTiles > 250_000 || longEdge >= 6144

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
      output: { longEdgePx: longEdge, edges, background: BG_COLOR[background] },
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
                <strong>Grid size</strong> is the detail — more tiles means a bigger, finer fractal.{' '}
                <strong>Resolution</strong> is the pixel size of the image. They’re independent: a big
                grid at a big resolution gives small, crisp tiles. Your walkers keep their position
                relative to the centre, so the pattern grows the same — with more room.
              </p>
              <p>
                Export runs in the background — a thumbnail appears in the corner with a spinner; the X
                cancels it. The full setup is stored inside the PNG, so later you’ll be able to reopen it.
              </p>
            </HelpButton>
          </div>

          <label className="export-row">
            <span>Grid size</span>
            <input type="number" min={2} step={10} value={gridN} onChange={(e) => setGridN(Math.max(2, Number(e.target.value) || 0))} />
          </label>

          <label className="export-row">
            <span>Resolution</span>
            <select value={longEdge} onChange={(e) => setLongEdge(Number(e.target.value))}>
              {resOptions.map((r) => (
                <option key={r} value={r}>
                  {r}px
                </option>
              ))}
            </select>
          </label>

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
            ≈ {pxPerTile.toFixed(pxPerTile < 10 ? 1 : 0)} px/tile · ≈ {estTiles.toLocaleString()} tiles
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
