// Reserved names — a custom predicate or traverser must NOT be named one of these, or a bare-word
// reference in the grammar would be ambiguous with it. A predicate is referenced by name in a guard
// (`if <name> then …`); a traverser is referenced by name (or `t1`, `t2`, …) in the Initial-state DSL.
// So a name that collides with a keyword, an attribute, a registry, or a positional reference token
// would be misread as that grammar element instead of the thing the user named.
//
// Drawn from the three parsers — keep in sync when a grammar grows:
//   predicate DSL   src/dsl/parse.ts (and/or/not/of/tile/default, tile-type, .-path words) + every
//                   attribute name in src/dsl/attributes.ts
//   traverser DSL   src/traverse/lang/parse.ts (settings, actions, directive grammar, movement, edges, regs)
//   initial state   src/initstate/parse.ts (auto-place, line, blob, visited, if)

import { ATTRIBUTES } from './attributes'
import { malformedNameError } from './names'

const WORDS: ReadonlyArray<string> = [
  // predicate DSL keywords + the shape test
  'and', 'or', 'not', 'of', 'tile', 'default', 'tile-type', 'exists',
  // .-path / edge words shared by the predicate paths and traverser moves
  'straight', 's', 'back', 'nearest-unvisited', 'target', 'e', 'r', 'l',
  // traverser DSL — settings
  'max-split', 'heading', 'movement', 'max-steps',
  // traverser DSL — actions + statement keywords
  'move', 'morph', 'put', 'increase', 'update', 'by',
  'directive', 'if', 'then', 'always', 'forbid', 'allow', 'reset', 'directives',
  // find-tile / find-lowest-tile / find-highest-tile search + its `fN` result reference
  'find-tile', 'find-lowest-tile', 'find-highest-tile', 'f',
  // movement values
  'relative', 'absolute',
  // list reducers (`[a, b]:sum` … `:xor`)
  'sum', 'avg', 'min', 'max', 'all', 'any', 'none', 'xor',
  // registries (tile A/B/C + walker P/Q/R)
  'a', 'b', 'c', 'p', 'q', 'r',
  // initial-state DSL
  'auto-place', 'line', 'blob', 'visited',
  // every attribute keyword (visited, steps, coordinate, orientation, first-step, …)
  ...ATTRIBUTES.map((a) => a.name),
]

// Lower-cased so the check is case-insensitive (names and the grammar both fold case for registries etc.).
export const RESERVED_WORDS: ReadonlySet<string> = new Set(WORDS.map((w) => w.toLowerCase()))

// Positional reference tokens the DSLs read by shape: an edge (`e3`), a turn (`r1`/`l2`), a traverser
// reference (`t1`) in the Initial-state DSL, or a found-tile reference (`f0`/`f1`) in the traverser DSL.
// A name of this shape would be swallowed as that reference.
const REFERENCE_PATTERN = /^[terlf][0-9]+$/i

// Returns a human error if `name` can't be used — malformed (space / illegal char / bad start), a
// reserved grammar word, or a positional reference pattern — else null. Duplicate-name checks (against
// OTHER predicates/traversers) are done by the caller, which knows the current set of names.
export function reservedNameError(name: string): string | null {
  const malformed = malformedNameError(name)
  if (malformed) return malformed
  const n = name.trim()
  if (!n) return null // an empty name is handled elsewhere (it auto-names from the DSL text)
  if (RESERVED_WORDS.has(n.toLowerCase())) return `"${n}" is a reserved word in the rule language — choose another name`
  if (REFERENCE_PATTERN.test(n)) {
    return `"${n}" clashes with an edge / turn / traverser / found-tile reference (like e1, r1, l1, t1, f1) — choose another name`
  }
  return null
}
