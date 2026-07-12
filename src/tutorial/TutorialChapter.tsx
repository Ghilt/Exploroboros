import './TutorialChapter.css'
import { useCallback, useMemo, useState } from 'react'
import { Workspace } from '../components/Workspace'
import { hrefFor } from '../router/useHashRoute'
import { useTutorialProgress } from '../state/tutorialProgress'
import { getScript, type TutorialScript } from './script'
import { useTutorialController } from './useTutorialController'
import { TutorialOverlay } from './TutorialOverlay'
import type { ScreenRect, TutorialHandle, TutorialSignals } from './types'

const INITIAL_SIGNALS: TutorialSignals = {
  leftOpen: null,
  rightOpen: null,
  selectedIds: [],
  seedCount: 0,
  step: 0,
  running: false,
  hasRun: false,
  editorOpen: false,
  traverserCount: 0,
  firstTraverserText: null,
}

// The guided chapter view: the real Workspace running in tutorial mode, with the tutorial overlay on
// top. A single sandbox Workspace + a controller reading its signals is all a chapter needs — the
// walkthrough is just the script data (src/tutorial/script.ts).
export function TutorialChapter({ chapterId }: { chapterId: string }) {
  const script = getScript(chapterId)
  if (!script) {
    return (
      <div className="container" style={{ padding: '3rem 0' }}>
        <h1 className="page-title">Chapter not found</h1>
        <p className="page-lead">That tutorial chapter doesn’t exist (yet).</p>
        <p>
          <a className="btn btn-ghost" href={hrefFor('tutorial')}>
            ← Back to the tutorial
          </a>
        </p>
      </div>
    )
  }
  return <ChapterView chapterId={chapterId} script={script} />
}

function ChapterView({ chapterId, script }: { chapterId: string; script: TutorialScript }) {
  const progress = useTutorialProgress()
  const [signals, setSignals] = useState<TutorialSignals>(INITIAL_SIGNALS)
  // The on-screen rect of the chapter's spotlight tile (reported by the canvas, tracking pan/zoom) — the
  // overlay uses it for a `ring: 'tile'` highlight.
  const [tileRect, setTileRect] = useState<ScreenRect | null>(null)

  const exit = useCallback(() => {
    window.location.hash = hrefFor('tutorial')
  }, [])
  const finish = useCallback(() => {
    progress.markComplete(chapterId)
    window.location.hash = hrefFor('tutorial')
  }, [progress, chapterId])

  const controller = useTutorialController(script, signals, finish)

  // A STABLE handle for the Workspace — its identity mustn't churn each render (Workspace guards the
  // signal callback behind a ref, but a stable handle avoids needless effect work). setSignals is
  // stable; the script fields are module constants.
  const handle: TutorialHandle = useMemo(
    () => ({
      onSignals: setSignals,
      stopAtStep: script.stopAtStep,
      coloring: script.coloring,
      forceTraverserName: script.forceTraverserName,
      spotlightTileId: script.spotlightTileId,
      onTileRect: setTileRect,
    }),
    [script],
  )

  return (
    <div className="tut-chapter">
      <Workspace tutorial={handle} />
      <TutorialOverlay controller={controller} onExit={exit} tileRect={tileRect} />
    </div>
  )
}
