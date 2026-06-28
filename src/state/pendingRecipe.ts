// A one-shot handoff for "open this creation in the canvas". The gallery (or a future caller) stashes
// a Recipe here and navigates to #/canvas; the Workspace consumes it once on mount and clears it. A
// plain module variable is enough — navigation remounts the Workspace, so there's nothing to subscribe
// to, and we never want a recipe to re-apply on a later visit.

import type { Recipe } from '../export'

let pending: Recipe | null = null

export function setPendingRecipe(recipe: Recipe): void {
  pending = recipe
}

// Return the stashed recipe (if any) and clear it, so it applies exactly once.
export function takePendingRecipe(): Recipe | null {
  const r = pending
  pending = null
  return r
}
