// The word game's client-side dictionary: a sorted, deduped, uppercased array with binary search for
// both whole-word AND prefix lookup (the prefix query drives the live "keep going vs dead end" hint).
// A sorted array (not a trie) keeps memory light at full scale — the ENABLE list is ~172k words, where
// a Map-based trie would allocate hundreds of thousands of node objects. Pure (no DOM), server-portable.

export type Dictionary = ReadonlyArray<string>

export function buildDictionary(words: Iterable<string>): Dictionary {
  const set = new Set<string>()
  for (const raw of words) {
    const w = raw.trim().toUpperCase()
    if (w) set.add(w)
  }
  return Array.from(set).sort()
}

// Index of the first entry >= target (classic lower-bound binary search). All entries are uppercase, so
// `<` compares them in the same order `.sort()` produced.
function lowerBound(dict: Dictionary, target: string): number {
  let lo = 0
  let hi = dict.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (dict[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

// Is `w` a complete word in the dictionary?
export function isWord(dict: Dictionary, w: string): boolean {
  const u = w.toUpperCase()
  const i = lowerBound(dict, u)
  return i < dict.length && dict[i] === u
}

// Could `w` still grow into a word — i.e. is it a prefix of some entry? (True for the empty string.) A
// false here means the current trace is a dead end: no continuation can ever spell a word. The smallest
// entry >= the prefix is the only candidate; if it doesn't start with the prefix, nothing does.
export function isPrefix(dict: Dictionary, w: string): boolean {
  const u = w.toUpperCase()
  if (u === '') return true
  const i = lowerBound(dict, u)
  return i < dict.length && dict[i].startsWith(u)
}
