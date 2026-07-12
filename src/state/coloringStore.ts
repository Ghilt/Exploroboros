// The ordered list of coloring rules, persisted in localStorage. Read top→bottom; the colorizer
// composites matching rules in order. Pure list updaters below are unit-tested without React; the
// hook wires them to persistence (same shape as predicateStore).

import { useCallback, useEffect, useState } from 'react'
import type { ColoringRule, RuleColor } from '../colorizer'
import { randomColoringRules } from '../data/coloringPresets'
import { loadStored, newId, saveStored } from './persist'

// v2: colour model changed (rule-level opacity + ramp breakpoints), so older saved rules are dropped.
const KEY = 'exploroboros:coloring:v2'
const VERSION = 2
type FileShape = { version: number; rules: ColoringRule[] }

export function makeRule(): ColoringRule {
  return {
    id: newId(),
    // Default to referencing a bundled predicate (just the dropdown). The inline text box only shows
    // when the user explicitly picks "Inline…", so it never appears unbidden.
    predicate: { kind: 'ref', id: 'visited' },
    color: { kind: 'flat', hex: '#e2682a' },
    opacity: 1,
  }
}

// ---- pure list updaters ----
export function withAddedRule(list: ReadonlyArray<ColoringRule>, rule: ColoringRule): ColoringRule[] {
  return [...list, rule]
}
export function withAddedRules(list: ReadonlyArray<ColoringRule>, rules: ReadonlyArray<ColoringRule>): ColoringRule[] {
  return [...list, ...rules]
}
export function withReplacedRule(list: ReadonlyArray<ColoringRule>, id: string, next: ColoringRule): ColoringRule[] {
  return list.map((r) => (r.id === id ? next : r))
}
// Deep-clone a rule's colour so a duplicate never shares the original's `stops` array (rules are treated
// as immutable, but a shared nested array would still couple the two copies).
function cloneColor(color: RuleColor): RuleColor {
  if (color.kind === 'flat') return { kind: 'flat', hex: color.hex }
  return { kind: 'ramp', ramp: { ...color.ramp, stops: color.ramp.stops.map((s) => ({ ...s })) } }
}
// Insert a copy of rule `id` (with fresh id `freshId`) directly after it — the intuitive spot for a
// "duplicate this rule" action. Unknown id: the list is returned unchanged (copied).
export function withDuplicatedRule(list: ReadonlyArray<ColoringRule>, id: string, freshId: string): ColoringRule[] {
  const i = list.findIndex((r) => r.id === id)
  if (i < 0) return [...list]
  const copy: ColoringRule = { ...list[i], id: freshId, predicate: { ...list[i].predicate }, color: cloneColor(list[i].color) }
  const next = [...list]
  next.splice(i + 1, 0, copy)
  return next
}
export function withRemovedRule(list: ReadonlyArray<ColoringRule>, id: string): ColoringRule[] {
  return list.filter((r) => r.id !== id)
}
export function withReordered(list: ReadonlyArray<ColoringRule>, from: number, to: number): ColoringRule[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list]
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function load(): ColoringRule[] {
  const data = loadStored<FileShape | null>(KEY, null)
  if (!data || data.version !== VERSION || !Array.isArray(data.rules)) return []
  return data.rules.filter((r): r is ColoringRule => !!r && typeof r.id === 'string' && !!r.predicate && !!r.color)
}

export type ColoringStore = {
  rules: ReadonlyArray<ColoringRule>
  persistOk: boolean
  add: () => string
  // Append a random hand-picked coloring (1–2 rules). Offered when the pane is empty.
  addRandomColoring: () => void
  replace: (id: string, next: ColoringRule) => void
  // Insert a copy of a rule directly after it (fresh id).
  duplicate: (id: string) => void
  remove: (id: string) => void
  reorder: (from: number, to: number) => void
  // Replace the whole list — used when opening a saved creation (reopen-from-PNG / gallery).
  setAll: (list: ReadonlyArray<ColoringRule>) => void
}

// `persist: false` (the tutorial sandbox) starts blank and never touches localStorage; the tutorial
// seeds its hidden gradient via setAll, and it's discarded on exit. Defaults true (the normal Canvas).
export function useColoringStore(opts?: { persist?: boolean }): ColoringStore {
  const persist = opts?.persist ?? true
  const [rules, setRules] = useState<ColoringRule[]>(() => (persist ? load() : []))
  const [persistOk, setPersistOk] = useState(true)

  useEffect(() => {
    if (persist) setPersistOk(saveStored<FileShape>(KEY, { version: VERSION, rules }))
  }, [rules, persist])

  const add = useCallback(() => {
    const rule = makeRule()
    setRules((list) => withAddedRule(list, rule))
    return rule.id
  }, [])
  const addRandomColoring = useCallback(() => setRules((list) => withAddedRules(list, randomColoringRules(newId))), [])
  const replace = useCallback((id: string, next: ColoringRule) => setRules((list) => withReplacedRule(list, id, next)), [])
  const duplicate = useCallback((id: string) => setRules((list) => withDuplicatedRule(list, id, newId())), [])
  const remove = useCallback((id: string) => setRules((list) => withRemovedRule(list, id)), [])
  const reorder = useCallback((from: number, to: number) => setRules((list) => withReordered(list, from, to)), [])
  const setAll = useCallback((list: ReadonlyArray<ColoringRule>) => setRules([...list]), [])

  return { rules, persistOk, add, addRandomColoring, replace, duplicate, remove, reorder, setAll }
}
