// Custom predicates the user authors, persisted in localStorage so they survive reloads. A predicate
// is stored as its DSL text (the stable serialization) plus a display name. `autoName` means the name
// tracks the DSL text — true until the user types their own name. Pure list helpers below are
// unit-tested without React; the hook wires them to persistence.

import { useCallback, useEffect, useState } from 'react'
import { parsePredicate, sanitizeName, serialize } from '../dsl'
import { loadStored, newId, saveStored } from './persist'

export type StoredPredicate = { id: string; name: string; text: string; autoName: boolean }

const KEY = 'exploroboros:predicates:v1'
const VERSION = 1
type FileShape = { version: number; predicates: StoredPredicate[] }

const DEFAULT_TEXT = 'visited > 0'

// The DSL-equivalent name for a predicate: its canonical serialization, or the raw text if it does
// not parse yet (so a half-typed predicate still shows something sensible).
export function autoNameOf(text: string): string {
  const r = parsePredicate(text)
  return r.ok ? serialize(r.value) : text.trim()
}

// "Simple" = a single comparison (no and/or/not/grouping) — these are the ones named purely by their
// DSL equivalent; compound predicates are expected to carry a user-given name.
export function isSimple(text: string): boolean {
  const r = parsePredicate(text)
  return r.ok && r.value.kind === 'compare'
}

export function makePredicate(text: string, name?: string): StoredPredicate {
  const auto = name === undefined
  return { id: newId(), name: auto ? autoNameOf(text) : name, text, autoName: auto }
}

// ---- pure list updaters ----
export function withAdded(list: ReadonlyArray<StoredPredicate>, pred: StoredPredicate): StoredPredicate[] {
  return [...list, pred]
}
export function withSetText(list: ReadonlyArray<StoredPredicate>, id: string, text: string): StoredPredicate[] {
  return list.map((p) => (p.id === id ? { ...p, text, name: p.autoName ? autoNameOf(text) : p.name } : p))
}
export function withRenamed(list: ReadonlyArray<StoredPredicate>, id: string, name: string): StoredPredicate[] {
  return list.map((p) => (p.id === id ? { ...p, name, autoName: false } : p))
}
export function withRemoved(list: ReadonlyArray<StoredPredicate>, id: string): StoredPredicate[] {
  return list.filter((p) => p.id !== id)
}

function load(): StoredPredicate[] {
  const data = loadStored<FileShape | null>(KEY, null)
  if (!data || data.version !== VERSION || !Array.isArray(data.predicates)) return []
  return data.predicates
    .filter(
      (p): p is StoredPredicate =>
        !!p && typeof p.id === 'string' && typeof p.text === 'string' && typeof p.name === 'string',
    )
    // Clean up a USER-given name authored before the no-spaces rule (spaces → `_`) so it loads without
    // a name error and stays referenceable. AUTO names mirror the DSL text ("visited > 0") and contain
    // spaces/operators by design — they're display-only, never referenced as identifiers, so leave them.
    .map((p) => (p.autoName ? p : { ...p, name: sanitizeName(p.name) }))
}

export type PredicateStore = {
  predicates: ReadonlyArray<StoredPredicate>
  persistOk: boolean
  add: () => string
  setText: (id: string, text: string) => void
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  // Replace the whole list — used when opening a saved creation (reopen-from-PNG / gallery).
  setAll: (list: ReadonlyArray<StoredPredicate>) => void
}

// `persist: false` (the tutorial sandbox) starts blank and never touches localStorage, so a guided
// session can't read or overwrite the user's real library. Defaults to true (the normal Canvas).
export function usePredicateStore(opts?: { persist?: boolean }): PredicateStore {
  const persist = opts?.persist ?? true
  const [predicates, setPredicates] = useState<StoredPredicate[]>(() => (persist ? load() : []))
  const [persistOk, setPersistOk] = useState(true)

  useEffect(() => {
    if (persist) setPersistOk(saveStored<FileShape>(KEY, { version: VERSION, predicates }))
  }, [predicates, persist])

  const add = useCallback(() => {
    const pred = makePredicate(DEFAULT_TEXT)
    setPredicates((list) => withAdded(list, pred))
    return pred.id
  }, [])

  const setText = useCallback((id: string, text: string) => setPredicates((list) => withSetText(list, id, text)), [])
  const rename = useCallback((id: string, name: string) => setPredicates((list) => withRenamed(list, id, name)), [])
  const remove = useCallback((id: string) => setPredicates((list) => withRemoved(list, id)), [])
  const setAll = useCallback((list: ReadonlyArray<StoredPredicate>) => setPredicates([...list]), [])

  return { predicates, persistOk, add, setText, rename, remove, setAll }
}
