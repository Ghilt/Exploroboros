// The tutorial state machine. Given the chapter script + the live Workspace signals, it holds the
// current step index and advances it: a SIGNAL step advances when its pure `proceed.test` becomes true
// (at most one step per signal change — see the [signals] dependency below); a NARRATION step advances
// when the overlay is clicked. It also surfaces a transient inline message (the block hint when the user
// clicks a dimmed area, or the wrong-tile nudge), and completes the chapter on the finale click.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TutorialScript, TutorialStep } from './script'
import type { TutorialSignals } from './types'

const WRONG_TILE = 'For this tutorial to proceed we will need you to click the specified tile.'
const MESSAGE_MS = 3400

export type TutorialController = {
  step: TutorialStep
  index: number
  total: number
  // A transient inline nudge (block hint / wrong tile), or null.
  message: string | null
  isFinale: boolean
  // A click on the dimmed overlay: advances a narration step (or finishes on the finale); on a
  // task step it means the user clicked a blocked (dimmed) region, so it flashes the step's block hint.
  onOverlayClick: () => void
}

export function useTutorialController(
  script: TutorialScript,
  signals: TutorialSignals,
  onFinish: () => void,
): TutorialController {
  const [index, setIndex] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const messageTimer = useRef<number | undefined>(undefined)
  // Read the current step through a ref so the signal effect can depend on [signals] ALONE — advancing
  // (which changes `index`) doesn't re-run it, so a single signal change advances at most one step.
  const indexRef = useRef(index)
  indexRef.current = index
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  const last = script.steps.length - 1
  const step = script.steps[Math.min(index, last)]

  const flash = useCallback((text: string) => {
    setMessage(text)
    window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(null), MESSAGE_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(messageTimer.current), [])

  // Signal-driven advancement. Depends on [signals] only (see indexRef note above).
  useEffect(() => {
    const cur = script.steps[indexRef.current]
    if (!cur || cur.proceed.on !== 'signal') return
    if (cur.proceed.test(signals)) {
      setMessage(null)
      setIndex((i) => Math.min(i + 1, script.steps.length - 1))
    } else if (
      cur.expectTileSelect &&
      signals.selectedIds.length === 1 &&
      signals.selectedIds[0] !== cur.expectTileSelect
    ) {
      flash(WRONG_TILE)
    }
  }, [signals, script, flash])

  const onOverlayClick = useCallback(() => {
    const cur = script.steps[indexRef.current]
    if (!cur) return
    if (cur.proceed.on === 'click') {
      setMessage(null)
      if (cur.finale) {
        onFinishRef.current()
        return
      }
      setIndex((i) => Math.min(i + 1, script.steps.length - 1))
    } else {
      flash(cur.blockHint)
    }
  }, [script, flash])

  return {
    step,
    index,
    total: script.steps.length,
    message,
    isFinale: !!step?.finale,
    onOverlayClick,
  }
}
