// The ordered list of coloring rules, persisted in localStorage. Read top→bottom; the colorizer
// composites matching rules in order. Pure list updaters below are unit-tested without React; the
// hook wires them to persistence (same shape as predicateStore).

import { useCallback, useEffect, useState } from 'react'
import type { ColoringRule } from '../colorizer'
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
export function withReplacedRule(list: ReadonlyArray<ColoringRule>, id: string, next: ColoringRule): ColoringRule[] {
  return list.map((r) => (r.id === id ? next : r))
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
  replace: (id: string, next: ColoringRule) => void
  remove: (id: string) => void
  reorder: (from: number, to: number) => void
}

export function useColoringStore(): ColoringStore {
  const [rules, setRules] = useState<ColoringRule[]>(load)
  const [persistOk, setPersistOk] = useState(true)

  useEffect(() => {
    setPersistOk(saveStored<FileShape>(KEY, { version: VERSION, rules }))
  }, [rules])

  const add = useCallback(() => {
    const rule = makeRule()
    setRules((list) => withAddedRule(list, rule))
    return rule.id
  }, [])
  const replace = useCallback((id: string, next: ColoringRule) => setRules((list) => withReplacedRule(list, id, next)), [])
  const remove = useCallback((id: string) => setRules((list) => withRemovedRule(list, id)), [])
  const reorder = useCallback((from: number, to: number) => setRules((list) => withReordered(list, from, to)), [])

  return { rules, persistOk, add, replace, remove, reorder }
}
