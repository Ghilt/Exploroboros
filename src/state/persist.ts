// Tiny localStorage helpers used by the predicate and coloring stores. Everything is wrapped so a
// missing localStorage (SSR/headless), corrupt JSON, or a quota error degrades gracefully to an
// in-memory fallback rather than throwing — the app must never white-screen over saved settings.

export const hasStorage = typeof window !== 'undefined' && !!window.localStorage

export function loadStored<T>(key: string, fallback: T): T {
  if (!hasStorage) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// Returns false when the write fails (quota, private mode) so a caller can surface a "changes are
// session-only" note. The value still lives in memory either way.
export function saveStored<T>(key: string, value: T): boolean {
  if (!hasStorage) return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2)}`
}
