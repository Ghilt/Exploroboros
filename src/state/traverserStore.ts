// Traverser definitions the user authors, persisted in localStorage so they survive reloads. A
// definition is its DSL program text plus a display NAME — the name doubles as the morph target and
// the Inspect placement key, so it should be a single word and unique (the default name generator
// keeps new ones distinct). Pure list helpers are unit-tested without React; the hook wires them to
// persistence. Mirrors predicateStore.

import { useCallback, useEffect, useState } from 'react'
import { loadStored, newId, saveStored } from './persist'

export type StoredTraverser = { id: string; name: string; text: string }

const KEY = 'exploroboros:traversers:v1'
const VERSION = 1
type FileShape = { version: number; traversers: StoredTraverser[] }

// A starter program: the built-in walker (step to the least-turn unvisited neighbour).
export const DEFAULT_TEXT = 'move nearest-unvisited'

// A unique default name like "walker", then "walker-2", "walker-3"… against the existing names.
export function uniqueName(list: ReadonlyArray<StoredTraverser>, base = 'walker'): string {
  const taken = new Set(list.map((t) => t.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export function makeTraverser(name: string, text: string = DEFAULT_TEXT): StoredTraverser {
  return { id: newId(), name, text }
}

// ---- pure list updaters ----
export function withAdded(list: ReadonlyArray<StoredTraverser>, t: StoredTraverser): StoredTraverser[] {
  return [...list, t]
}
export function withSetText(list: ReadonlyArray<StoredTraverser>, id: string, text: string): StoredTraverser[] {
  return list.map((t) => (t.id === id ? { ...t, text } : t))
}
export function withRenamed(list: ReadonlyArray<StoredTraverser>, id: string, name: string): StoredTraverser[] {
  return list.map((t) => (t.id === id ? { ...t, name } : t))
}
export function withRemoved(list: ReadonlyArray<StoredTraverser>, id: string): StoredTraverser[] {
  return list.filter((t) => t.id !== id)
}

function load(): StoredTraverser[] {
  const data = loadStored<FileShape | null>(KEY, null)
  if (!data || data.version !== VERSION || !Array.isArray(data.traversers)) return []
  return data.traversers.filter(
    (t): t is StoredTraverser =>
      !!t && typeof t.id === 'string' && typeof t.text === 'string' && typeof t.name === 'string',
  )
}

export type TraverserStore = {
  traversers: ReadonlyArray<StoredTraverser>
  persistOk: boolean
  add: () => string
  setText: (id: string, text: string) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  // Replace the whole list — used when opening a saved creation (reopen-from-PNG / gallery).
  setAll: (list: ReadonlyArray<StoredTraverser>) => void
}

export function useTraverserStore(): TraverserStore {
  const [traversers, setTraversers] = useState<StoredTraverser[]>(load)
  const [persistOk, setPersistOk] = useState(true)

  useEffect(() => {
    setPersistOk(saveStored<FileShape>(KEY, { version: VERSION, traversers }))
  }, [traversers])

  const add = useCallback(() => {
    const t = makeTraverser(uniqueName(traversers))
    setTraversers((list) => withAdded(list, t))
    return t.id
  }, [traversers])

  const setText = useCallback((id: string, text: string) => setTraversers((list) => withSetText(list, id, text)), [])
  const rename = useCallback((id: string, name: string) => setTraversers((list) => withRenamed(list, id, name)), [])
  const remove = useCallback((id: string) => setTraversers((list) => withRemoved(list, id)), [])
  const setAll = useCallback((list: ReadonlyArray<StoredTraverser>) => setTraversers([...list]), [])

  return { traversers, persistOk, add, setText, rename, remove, setAll }
}
