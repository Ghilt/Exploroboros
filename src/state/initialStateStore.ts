// The Initial-state DSL document the user authors, persisted in localStorage so it survives reloads.
// A single document (not a list) of `auto-place` lines that seed the fractal's starting state —
// traversers + tile registries + visited — by grid-relative rules (see src/initstate). It rides into
// the exported PNG recipe (recipe.initialState) so a saved creation reopens intact. Mirrors the other
// src/state stores' shape (persist helpers, a `setAll` for reopen).

import { useCallback, useEffect, useState } from 'react'
import { loadStored, newId, saveStored } from './persist'

export type StoredInitialState = { id: string; text: string }

const KEY = 'exploroboros:initialState:v1'
const VERSION = 1
type FileShape = { version: number; state: StoredInitialState }

export const DEFAULT_TEXT = ''

export function makeInitialState(text: string = DEFAULT_TEXT): StoredInitialState {
  return { id: newId(), text }
}

function load(): StoredInitialState {
  const data = loadStored<FileShape | null>(KEY, null)
  if (!data || data.version !== VERSION || !data.state || typeof data.state.text !== 'string') {
    return makeInitialState()
  }
  return { id: typeof data.state.id === 'string' ? data.state.id : newId(), text: data.state.text }
}

export type InitialStateStore = {
  text: string
  persistOk: boolean
  setText: (text: string) => void
  // Replace the whole document — used when opening a saved creation (reopen-from-PNG / gallery).
  setAll: (state: StoredInitialState) => void
}

export function useInitialStateStore(): InitialStateStore {
  const [state, setState] = useState<StoredInitialState>(load)
  const [persistOk, setPersistOk] = useState(true)

  useEffect(() => {
    setPersistOk(saveStored<FileShape>(KEY, { version: VERSION, state }))
  }, [state])

  const setText = useCallback((text: string) => setState((s) => ({ ...s, text })), [])
  const setAll = useCallback((next: StoredInitialState) => setState({ ...next }), [])

  return { text: state.text, persistOk, setText, setAll }
}
