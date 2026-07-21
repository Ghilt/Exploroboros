import './DailyGame.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TilingCanvas } from '../components/TilingCanvas'
import { Panel } from '../components/Panel'
import { extendTrace } from '../canvas'
import { dailyBoard, utcDateKey, wordScore } from '../wordgame/board'
import { buildDictionary, isWord, isPrefix, type Dictionary } from '../wordgame/dictionary'
import { WORDLIST } from '../wordgame/wordlist'
import { loadEnableWords } from '../wordgame/enableList'
import { judgeWord } from '../wordgame/submit'

type Flash = { tiles: ReadonlyArray<string>; kind: 'good' | 'bad'; nonce: number }

// The daily word game (hidden feature — reachable at #/daily, no Nav link). Iteration 2 completes the
// core loop: drag across touching letters to spell a word, release to submit. A valid, not-yet-found
// word (3+ letters, in the dictionary) scores its Scrabble letter-sum and joins the found list; an
// invalid attempt gets a red pulse. The chip previews the current letters and hints valid / dead-end
// live. Still deferred: scoring RULES + a win condition, and the backend-served seed.
export function DailyGame() {
  const dateKey = useMemo(() => utcDateKey(new Date()), [])
  // Normally the deterministic daily board (seeded by the date). The debug "Randomize" swaps in a fresh
  // random key — dailyBoard is a pure function of its key, so that re-picks the tiling AND the letters.
  const [boardKey, setBoardKey] = useState(dateKey)
  const board = useMemo(() => dailyBoard(boardKey), [boardKey])
  // Start on the small placeholder list so the game is instantly playable, then swap in the full ENABLE
  // dictionary once its lazy chunk arrives (a moment later). WORDLIST stays the fallback if the load fails.
  const [dict, setDict] = useState<Dictionary>(() => buildDictionary(WORDLIST))
  useEffect(() => {
    let live = true
    loadEnableWords()
      .then((words) => {
        if (live) setDict(buildDictionary(words))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const lettersOf = useCallback(
    (tiles: ReadonlyArray<string>) => tiles.map((id) => board.letters.get(id) ?? '').join(''),
    [board],
  )

  // The active drag path (ordered tile ids); the canvas reports the tile under the pointer and we run
  // the pure self-avoiding / backtrack reducer.
  const [path, setPath] = useState<ReadonlyArray<string>>([])
  const pathRef = useRef(path)
  pathRef.current = path
  // Accepted words (kept for the list + to derive the score).
  const [found, setFound] = useState<ReadonlyArray<{ word: string; value: number }>>([])
  const foundRef = useRef(found)
  foundRef.current = found
  // A transient post-release highlight: the just-submitted path, green (accepted) or red (rejected).
  const [flash, setFlash] = useState<Flash | null>(null)
  const flashRef = useRef(flash)
  flashRef.current = flash
  const flashTimer = useRef(0)
  const burstSeq = useRef(0)

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  const score = found.reduce((s, f) => s + f.value, 0)

  const onTraceMove = useCallback(
    (tile: string | null) => {
      if (flashRef.current) {
        window.clearTimeout(flashTimer.current)
        setFlash(null)
      }
      setPath((prev) => extendTrace(board.tiling, prev, tile))
    },
    [board],
  )

  const onTraceEnd = useCallback(() => {
    const p = pathRef.current
    const w = lettersOf(p)
    window.clearTimeout(flashTimer.current)
    const judged = judgeWord(dict, foundRef.current.map((f) => f.word), w)
    if (judged.accept) {
      setFound((prev) => [...prev, { word: w, value: judged.value }])
      setFlash({ tiles: p, kind: 'good', nonce: (burstSeq.current += 1) })
      flashTimer.current = window.setTimeout(() => setFlash(null), 700)
    } else if (p.length > 0) {
      setFlash({ tiles: p, kind: 'bad', nonce: (burstSeq.current += 1) })
      flashTimer.current = window.setTimeout(() => setFlash(null), 700)
    }
    setPath([])
  }, [dict, lettersOf])

  // Debug: jump to a fresh random board (new tiling + letters) and reset the round.
  const randomize = useCallback(() => {
    window.clearTimeout(flashTimer.current)
    setPath([])
    setFound([])
    setFlash(null)
    setBoardKey(`debug-${Date.now()}-${Math.random()}`)
  }, [])

  // What the chip + canvas show: the flash (just-submitted) if present, else the live drag.
  const liveWord = lettersOf(path)
  const liveValid = liveWord.length >= 3 && isWord(dict, liveWord)
  const chipWord = flash ? lettersOf(flash.tiles) : liveWord
  const chipKind: 'good' | 'bad' | 'dead' | 'active' = flash
    ? flash.kind
    : liveValid
      ? 'good'
      : liveWord.length >= 2 && !isPrefix(dict, liveWord)
        ? 'dead'
        : 'active'
  // The canvas shows only the ACTIVE drag path; on release it clears and the burst animation (below)
  // takes over as the release feedback. The chip still reflects the submitted word via `flash`.
  const tracePath = path
  const traceStatus: 'active' | 'word' | 'bad' = liveValid ? 'word' : 'active'

  return (
    <div className="daily">
      <div className="daily-stage">
        <TilingCanvas
          tiling={board.tiling}
          displayMode="edges"
          letters={board.letters}
          dragMode="trace"
          tracePath={tracePath}
          traceStatus={traceStatus}
          burst={flash ?? undefined}
          onTraceMove={onTraceMove}
          onTraceEnd={onTraceEnd}
        />
        <div className={`daily-chip daily-chip--${chipKind}`} aria-live="polite">
          {chipWord ? (
            <>
              <span className="daily-chip-word">{chipWord}</span>
              <span className="daily-chip-val">{wordScore(chipWord)}</span>
            </>
          ) : (
            <span className="daily-chip-empty">Drag across touching letters</span>
          )}
        </div>
      </div>

      <Panel title="Daily" side="right" wide>
        <div className="daily-pane">
          <p className="daily-meta">
            {boardKey === dateKey ? dateKey : 'random board'} · {board.label}
          </p>
          <button type="button" className="daily-debug" onClick={randomize}>
            ⟳ Randomize board (debug)
          </button>
          <div className="daily-score">
            <span className="daily-score-num">{score}</span>
            <span className="daily-score-label">score</span>
          </div>
          {found.length > 0 ? (
            <div className="daily-found">
              <p className="daily-found-head">{found.length} word{found.length === 1 ? '' : 's'}</p>
              <ul className="daily-found-list">
                {found.map((f) => (
                  <li key={f.word}>
                    <span className="daily-found-word">{f.word}</span>
                    <span className="daily-found-val">{f.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="daily-hint">
              Drag across touching letters to spell a word (3+ letters), then release. Drag back a step
              to undo. Valid words turn green; misses pulse red.
            </p>
          )}
        </div>
      </Panel>
    </div>
  )
}
