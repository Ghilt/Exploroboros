// Predicate / traverser NAME rules — kept in a dependency-free module (no imports) so it can be pulled
// into the recipe migration (src/export) and the Cloudflare Functions bundle without dragging in the
// rest of the DSL. A name must be a single, bare identifier so it can be referenced in DSL text by name
// (`Has_A and Has_C`) — no spaces, no punctuation beyond `_`/`-`, and it must start with a letter.

// Matches the lexer's identifier production exactly: start with a letter, then letters/digits/
// underscores, with hyphens allowed only BEFORE a letter (so `first-step`, `Has_A`, `Level_2` are one
// token, but `Has A`, `2cool`, `foo-`, `a b` are not). Keep in sync with src/dsl/lex.ts.
export const VALID_NAME = /^[A-Za-z][A-Za-z0-9_]*(-[A-Za-z][A-Za-z0-9_]*)*$/

// Turn an arbitrary display name into a valid one: collapse every run of disallowed characters (spaces
// included) into a single `_`. Idempotent, and a no-op on an already-valid name. Used to migrate names
// authored before the no-spaces rule (imported recipes, the owner's saved library) so they load clean.
// A name that still isn't valid after this (e.g. it starts with a digit) is left for validation to flag.
export function sanitizeName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]+/g, '_')
}

// A human error if `name` can't be a bare identifier (space / illegal char / bad start), else null. The
// empty case is handled by the caller (a blank name auto-names from the DSL). This is the malformed-shape
// half of the name check; reservedNameError layers the reserved-word / reference-pattern checks on top.
export function malformedNameError(name: string): string | null {
  const n = name.trim()
  if (!n) return null
  if (/\s/.test(n)) return `"${n}" can't contain spaces — use _ instead, e.g. Has_A`
  if (!VALID_NAME.test(n)) {
    return `"${n}" can only use letters, digits, _ and - (and must start with a letter)`
  }
  return null
}
