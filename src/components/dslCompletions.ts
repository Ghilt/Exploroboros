// The completion lists for the DSL editors' Ctrl+Space autocomplete (see DslTextarea). Pure — so they
// can be unit-tested without rendering. Two kinds of list:
//  - the PREDICATE/expression position (after `if`, or the whole of a predicate field): tile attributes,
//    optionally the walker's own attributes, `not`, and the referenceable predicate names.
//  - the STATEMENT-START position (a blank line): the keywords a line of that DSL can begin with. These
//    differ per DSL, so each editor supplies its own (TRAVERSER_STARTERS / INIT_STARTERS).

import { ATTRIBUTES, TILE_ATTRIBUTES } from '../dsl'

export type DslCompletion = {
  value: string
  kind: 'attribute' | 'walker' | 'predicate' | 'keyword'
  // A short trailing note (e.g. "takes [n]") — muted, purely informational.
  hint?: string
}

// The expression/predicate-position list. Tile attributes are always offered; the walker's own
// attributes (steps/heading/P/Q/R) only where a walker exists (the Traversers editor), since they read
// as 0 in the walker-free coloring/initial-state contexts; predicate names come from the caller's
// name->text map (bundled + custom). De-duped by value.
export function buildDslCompletions(opts: {
  predicateNames?: ReadonlyMap<string, string>
  includeTraverser?: boolean
}): DslCompletion[] {
  const out: DslCompletion[] = []
  const seen = new Set<string>()
  const push = (c: DslCompletion) => {
    if (seen.has(c.value)) return
    seen.add(c.value)
    out.push(c)
  }
  for (const a of TILE_ATTRIBUTES) push({ value: a.name, kind: 'attribute', hint: a.indexed ? 'takes [n]' : undefined })
  push({ value: 'tile-type', kind: 'attribute', hint: '== shape' })
  // Tile registries A/B/C are first-class values now (bare, or in a list `[A]`) — offer them everywhere.
  for (const reg of ['A', 'B', 'C']) push({ value: reg, kind: 'attribute', hint: 'tile registry' })
  push({ value: 'not', kind: 'keyword', hint: 'negate' })
  push({ value: 'exists', kind: 'keyword', hint: '@path resolves to a tile' })
  if (opts.includeTraverser) {
    for (const a of ATTRIBUTES) if (a.scopes.includes('traverser') && !a.alias) push({ value: a.name, kind: 'walker' })
  }
  if (opts.predicateNames) for (const name of opts.predicateNames.keys()) push({ value: name, kind: 'predicate' })
  return out
}

// The keywords a TRAVERSER line can start with (the authoritative set from the traverser parser): the
// header settings, the `if` guard, the bare actions, and the directive forms.
export const TRAVERSER_STARTERS: ReadonlyArray<DslCompletion> = [
  { value: 'if', kind: 'keyword', hint: 'guard an action, or { … } block' },
  { value: 'move', kind: 'keyword', hint: 'step along an edge' },
  { value: 'find-tile', kind: 'keyword', hint: 'search for a tile → fN' },
  { value: 'put', kind: 'keyword', hint: 'set a registry' },
  { value: 'increase', kind: 'keyword', hint: 'bump a registry' },
  { value: 'morph', kind: 'keyword', hint: 'switch definition' },
  { value: 'update', kind: 'keyword', hint: 'change a setting' },
  { value: 'directive', kind: 'keyword', hint: 'gate moves' },
  { value: 'reset directives', kind: 'keyword', hint: 'clear the gates' },
  { value: 'heading', kind: 'keyword', hint: '= edge number' },
  { value: 'max-split', kind: 'keyword', hint: '= N' },
  { value: 'max-steps', kind: 'keyword', hint: '= N' },
  { value: 'movement', kind: 'keyword', hint: '= relative | absolute' },
]

// The keyword an INITIAL-STATE line can start with (only `auto-place`).
export const INIT_STARTERS: ReadonlyArray<DslCompletion> = [
  { value: 'auto-place', kind: 'keyword', hint: 'line { … } | blob { … }' },
]
