// A localStorage soft-guard for upvotes: which creation ids this browser has already upvoted, so the
// button can disable after voting. Deliberately light (no accounts) — worst case is a vanity counter,
// which the 10/day upload cap already bounds. Reuses the app's persist helpers.

import { useCallback, useState } from 'react'
import { loadStored, saveStored } from '../state/persist'

const KEY = 'exploroboros:voted:v1'

export function useVotedStore() {
  const [voted, setVoted] = useState<Set<string>>(() => new Set(loadStored<string[]>(KEY, [])))

  const hasVoted = useCallback((id: string) => voted.has(id), [voted])

  const markVoted = useCallback((id: string) => {
    setVoted((cur) => {
      if (cur.has(id)) return cur
      const next = new Set(cur)
      next.add(id)
      saveStored(KEY, [...next])
      return next
    })
  }, [])

  return { hasVoted, markVoted }
}
