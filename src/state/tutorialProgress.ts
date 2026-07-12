// Which tutorial chapters the user has finished, persisted in localStorage so a ✓ sticks across
// reloads. Unlike the tutorial's sandbox workspace (which is deliberately ephemeral), progress IS
// worth keeping — it's the user's history, not throwaway practice data. Mirrors the other src/state
// stores' persist shape.

import { useCallback, useEffect, useState } from 'react'
import { loadStored, saveStored } from './persist'

const KEY = 'exploroboros:tutorialProgress:v1'
const VERSION = 1
type FileShape = { version: number; completed: string[] }

function load(): string[] {
  const data = loadStored<FileShape | null>(KEY, null)
  if (!data || data.version !== VERSION || !Array.isArray(data.completed)) return []
  return data.completed.filter((id): id is string => typeof id === 'string')
}

export type TutorialProgress = {
  completed: ReadonlyArray<string>
  isComplete: (chapterId: string) => boolean
  markComplete: (chapterId: string) => void
}

export function useTutorialProgress(): TutorialProgress {
  const [completed, setCompleted] = useState<string[]>(load)

  useEffect(() => {
    saveStored<FileShape>(KEY, { version: VERSION, completed })
  }, [completed])

  const isComplete = useCallback((chapterId: string) => completed.includes(chapterId), [completed])
  const markComplete = useCallback(
    (chapterId: string) => setCompleted((list) => (list.includes(chapterId) ? list : [...list, chapterId])),
    [],
  )

  return { completed, isComplete, markComplete }
}
