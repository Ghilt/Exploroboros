import './DebugPane.css'
import { HelpButton } from './HelpButton'
import { walkerGroups, statementGroups, candidateGroups } from '../debug/highlights'
import type { HighlightGroups } from './TilingCanvas'
import type { CandidateTrace, ReadTile, StmtTrace, TickTrace, TraverserTrace } from '../traverse'

// The per-tick decision log (debug mode). Reads the engine's TickTrace and lays it out as walker →
// statement → candidate rows; hovering any row reports the tiles it's about (via the pure mappers in
// src/debug/highlights) so the canvas can highlight them, and clicking pins that highlight. A bounded
// history of recent ticks is scrubbable. Desktop-first developer tool.
type Props = {
  history: ReadonlyArray<TickTrace>
  viewedStep: number | null // null = follow the latest tick
  onViewStep: (step: number | null) => void
  // Tile id -> user-facing number (Workspace's indexById), for readable "#N" labels.
  tileNumber: (id: string) => number
  onHover: (groups: HighlightGroups | null) => void
  pinnedKey: string | null
  onPinToggle: (key: string, groups: HighlightGroups) => void
}

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ')

export function DebugPane({ history, viewedStep, onViewStep, tileNumber, onHover, pinnedKey, onPinToggle }: Props) {
  const trace = viewedStep === null ? history.at(-1) ?? null : history.find((t) => t.nextStep === viewedStep) ?? history.at(-1) ?? null
  const idx = trace ? history.indexOf(trace) : -1
  const canPrev = idx > 0
  const canNext = idx >= 0 && idx < history.length - 1
  const following = viewedStep === null
  const num = (id: string | null | undefined) => (id ? `#${tileNumber(id)}` : '(boundary)')

  return (
    <div className="dbg" onMouseLeave={() => onHover(null)}>
      <div className="dbg-legend" aria-hidden="true">
        <span className="dbg-leg"><i className="dbg-dot dbg-dot--current" />current</span>
        <span className="dbg-leg"><i className="dbg-dot dbg-dot--decorator" />reads</span>
        <span className="dbg-leg"><i className="dbg-dot dbg-dot--chosen" />moved</span>
        <span className="dbg-leg"><i className="dbg-dot dbg-dot--rejected" />rejected</span>
      </div>

      <header className="dbg-head">
        <div className="dbg-nav seg-shell" role="group" aria-label="tick history">
          <button type="button" className="seg-item seg-item--btn" disabled={!canPrev} onClick={() => canPrev && onViewStep(history[idx - 1].nextStep)} aria-label="previous tick">‹</button>
          <span className="seg-item dbg-tick" title={trace ? `decisions from tick ${trace.step} → ${trace.nextStep}` : undefined}>{trace ? `tick ${trace.nextStep}` : 'tick —'}</span>
          <button type="button" className="seg-item seg-item--btn" disabled={!canNext} onClick={() => { const n = idx + 1; onViewStep(n >= history.length - 1 ? null : history[n].nextStep) }} aria-label="next tick">›</button>
        </div>
        {!following && <button type="button" className="dbg-latest" onClick={() => onViewStep(null)}>latest</button>}
        <HelpButton title="Debug log">
          <p>
            Each tick records what every walker decided. Press <strong>Step</strong> to advance one tick at a
            time — or <strong>Play</strong> a run — and read the decisions here.
          </p>
          <p>
            Each walker shows the statements it ran. <strong>Hover a row</strong> to light up the tiles
            it’s about on the canvas: <span className="dbg-key dbg-key--current">current</span> tile,
            each tile a guard <span className="dbg-key dbg-key--decorator">reads</span> via an
            <code> @</code>-path (<code>visited@e1</code>, <code>tile-type@target</code>), where it
            <span className="dbg-key dbg-key--chosen"> moved</span>, and any
            <span className="dbg-key dbg-key--rejected"> rejected</span> candidate. Click a row to pin
            the highlight. So if <code>if tile-type@e0 == wedge …</code> won’t fire, you can see
            <em> @e0</em> is pointing at the wrong tile.
          </p>
        </HelpButton>
      </header>

      {!trace ? (
        <p className="pane-hint">
          This is a per-tick log of every traverser’s decisions — for each walker, the statements it ran, every
          candidate move, and why each was chosen or rejected. Place a walker and press <strong>Step</strong>{' '}
          (or <strong>Play</strong>) to advance a tick; the decisions show here. Hover a row to highlight the
          tiles it read.
        </p>
      ) : trace.traversers.length === 0 ? (
        <p className="pane-hint">No walkers on this tick.</p>
      ) : (
        <div className="dbg-walkers">
          {trace.traversers.map((w, i) => (
            <WalkerBlock key={`${w.id}.${i}`} w={w} wi={i} sole={trace.traversers.length === 1} num={num} onHover={onHover} pinnedKey={pinnedKey} onPinToggle={onPinToggle} />
          ))}
          {trace.coalesced.length > 0 && <p className="dbg-note">{trace.coalesced.length} branch{trace.coalesced.length > 1 ? 'es' : ''} merged (identical state).</p>}
          {trace.dropped.length > 0 && <p className="dbg-note">{trace.dropped.length} dropped (max-steps).</p>}
        </div>
      )}
    </div>
  )
}

function WalkerBlock({
  w,
  wi,
  sole,
  num,
  onHover,
  pinnedKey,
  onPinToggle,
}: {
  w: TraverserTrace
  wi: number
  sole: boolean
  num: (id: string | null | undefined) => string
  onHover: (g: HighlightGroups | null) => void
  pinnedKey: string | null
  onPinToggle: (key: string, g: HighlightGroups) => void
}) {
  const moved = !w.missingDef && w.branches.length > 0
  const outcome = w.missingDef
    ? `unknown definition “${w.def}”`
    : w.branches.length === 0
      ? 'did not move'
      : w.branches.length === 1
        ? `moved to ${num(w.branches[0].tile)}`
        : `split into ${w.branches.length}`

  return (
    <details className="dbg-walker" open={sole || !moved}>
      <summary className="dbg-walker-sum" onMouseEnter={() => onHover(walkerGroups(w))} onMouseLeave={() => onHover(null)}>
        <span className="dbg-id">{w.id}</span>
        <span className="dbg-cur">{num(w.tile)} {w.tileType}</span>
        <span className={cx('dbg-outcome', !moved && 'is-dead')}>→ {outcome}</span>
      </summary>
      {!moved && !w.missingDef && <div className="dbg-banner">{noMoveReason(w, num)}</div>}
      <div className="dbg-stmts">
        {w.statements.map((s, j) => (
          <StmtRow key={j} w={w} s={s} rowKey={`w${wi}.s${j}`} num={num} onHover={onHover} pinnedKey={pinnedKey} onPinToggle={onPinToggle} />
        ))}
        {w.statements.length === 0 && !w.missingDef && <p className="dbg-empty">no statements ran</p>}
      </div>
    </details>
  )
}

function StmtRow({
  w,
  s,
  rowKey,
  num,
  onHover,
  pinnedKey,
  onPinToggle,
}: {
  w: TraverserTrace
  s: StmtTrace
  rowKey: string
  num: (id: string | null | undefined) => string
  onHover: (g: HighlightGroups | null) => void
  pinnedKey: string | null
  onPinToggle: (key: string, g: HighlightGroups) => void
}) {
  const groups = statementGroups(w, s)
  const head = (
    <div
      className={cx('dbg-stmt', pinnedKey === rowKey && 'is-pinned')}
      onMouseEnter={() => onHover(groups)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onPinToggle(rowKey, groups)}
    >
      <code className="dbg-src">{s.source}</code>
      <Verdict s={s} />
    </div>
  )

  if (s.kind === 'gate-skip') {
    return (
      <div className="dbg-stmt-group">
        {head}
        <div className="dbg-detail" onMouseEnter={() => onHover(groups)} onMouseLeave={() => onHover(null)}>
          {s.guard.readTiles.length > 0 ? (
            <>
              reads{' '}
              {s.guard.readTiles.map((r, i) => (
                <span key={i}>
                  {i > 0 ? ', ' : ''}
                  <code>{r.text}</code> = {r.tileType ?? 'boundary'} {num(r.id)}
                </span>
              ))}{' '}
              — <code>{s.guard.text}</code> → false
            </>
          ) : (
            <>
              <code>{s.guard.text}</code> → false (current tile)
            </>
          )}
        </div>
      </div>
    )
  }

  if (s.kind === 'move') {
    return (
      <div className="dbg-stmt-group">
        {head}
        <ul className="dbg-cands">
          {s.candidates.map((c, k) => {
            const ck = `${rowKey}.c${k}`
            return (
              <li
                key={k}
                className={cx('dbg-cand', !c.survived && 'is-reject', pinnedKey === ck && 'is-pinned')}
                onMouseEnter={() => onHover(candidateGroups(w, c))}
                onMouseLeave={() => onHover(null)}
                onClick={() => onPinToggle(ck, candidateGroups(w, c))}
              >
                <code className="dbg-chain">{c.chainText}</code>
                <span className="dbg-dest">→ {num(c.dest)}{c.destType ? ` ${c.destType}` : ''}</span>
                <span className={cx('dbg-verdict', c.survived ? 'is-ok' : 'is-no')}>{c.survived ? '✓' : `✗ ${rejectText(c)}`}</span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return head
}

function Verdict({ s }: { s: StmtTrace }) {
  switch (s.kind) {
    case 'gate-skip':
      return <span className="dbg-chip dbg-chip--skip">skipped</span>
    case 'move': {
      const fired = s.candidates.some((c) => c.survived)
      return <span className={cx('dbg-chip', fired ? 'dbg-chip--fire' : 'dbg-chip--skip')}>{fired ? 'fired' : 'no move'}</span>
    }
    case 'directive':
      return <span className="dbg-chip dbg-chip--dir">{s.allow ? 'allow' : 'forbid'}</span>
    default:
      return <span className="dbg-chip">{s.kind === 'reset' ? 'reset' : 'done'}</span>
  }
}

function rejectText(c: CandidateTrace): string {
  const r = c.reject
  if (!r) return 'rejected'
  switch (r.by) {
    case 'boundary':
      return 'boundary'
    case 'max-split':
      return 'split cap'
    case 'own-guard':
      return r.guard.text
    case 'directive':
      return `${r.allow ? 'allow' : 'forbid'} ${r.guard.text}`
  }
}

// A summary of the tiles a guard read via `@`-paths, for the no-move banner (empty = the current tile).
function readsText(readTiles: ReadonlyArray<ReadTile>, num: (id: string | null | undefined) => string): string {
  if (readTiles.length === 0) return 'the current tile'
  return readTiles.map((r) => `${r.text} = ${r.tileType ?? 'boundary'} ${num(r.id)}`).join(', ')
}

// A one-line "why didn't it move" for a dropped walker — the first gate-skip or all-rejected move.
function noMoveReason(w: TraverserTrace, num: (id: string | null | undefined) => string): string {
  const gs = w.statements.find((s) => s.kind === 'gate-skip')
  if (gs && gs.kind === 'gate-skip') {
    return `No move — “${gs.source}” skipped: ${gs.guard.text} on ${readsText(gs.guard.readTiles, num)} → false.`
  }
  const mv = w.statements.find((s) => s.kind === 'move')
  if (mv && mv.kind === 'move' && mv.candidates.length > 0) {
    return `No move — every candidate of “${mv.source}” was rejected.`
  }
  return 'No move this tick — the walker was dropped.'
}
