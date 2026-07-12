// Find every illuminatable "path" in a traverser program's text — a move chain (`move straight`,
// `move r1.r2`) or an attribute/registry/write `.`-path (`visited.e1`, `[A.r1.straight]`, `put a.e1 = 1`)
// — with its SOURCE SPAN, so the path-preview feature can filter by the user's text selection and light up
// the tiles each path reaches. Pure & isomorphic (no React/DOM/Konva), like the rest of src/traverse/lang.
//
// This is a SCANNER, not a full parser: it re-lexes the program, isolates each path-bearing token run, and
// delegates that run's parse to the EXISTING fragment parsers (parseChainFragment / parsePathFragment) so
// the chain/segment grammar is never duplicated. The AST carries no source spans; the scanner gets spans
// from the token offsets it isolates. Selection intersection happens downstream (src/canvas), not here.
//
// EVERY path illuminates — move destinations AND neighbour-reads inside conditions/values/write targets —
// not just destinations (owner's choice). Non-path syntax (numbers, `=`, `if`, comparisons, reducers,
// setting names, shape names) is simply never inside an isolated path run, so it's never emitted.

import type { EdgeRef, Chain } from './types'
import type { TilePath } from '../../dsl'
import { parsePathFragment } from '../../dsl'
import { lexProgram, type Tok } from './lex'
import { parseChainFragment } from './parse'
import { segToEdgeRef } from './exec'

// How a walk STARTS — plain data mirroring exec.ts:resolvePathFrom's base handling. `found`/`target` can't
// be resolved statically in the editor (no per-tick found list, no move destination) → an empty walk.
export type OccurrenceBase =
  | { kind: 'current' } // no base: start at the caller's tile + heading
  | { kind: 'found'; index: number } // .fN / move fN
  | { kind: 'tile'; index: number } // .tile N — start at the absolute tile N
  | { kind: 'target' } // .target

export type PathOccurrence = {
  span: { start: number; end: number } // half-open char offsets into the program text
  line: number // 0-based source line of span.start — drives the per-line preview colour + swatch
  base: OccurrenceBase
  refs: ReadonlyArray<EdgeRef> // ordered edge hops (edge/turn/straight/unvisited); may be empty for a base
  text: string // the raw source slice of span — a faithful label
}

// A hop-shaped move Chain lifted to (base, refs). An inline `find-tile { … }` base can't be previewed → null.
function liftChain(chain: Chain): { base: OccurrenceBase; refs: EdgeRef[] } | null {
  if (!chain.base) return { base: { kind: 'current' }, refs: [...chain.refs] }
  if (chain.base.kind === 'found') return { base: { kind: 'found', index: chain.base.index }, refs: [...chain.refs] }
  return null // inline find-tile base
}

// A TilePath lifted to (base, refs) the same way exec.ts:resolvePathFrom splits its first segment. A
// terminal seg mid-chain (the parser forbids it) makes segToEdgeRef return null → the whole path is dropped.
function liftPath(path: TilePath): { base: OccurrenceBase; refs: EdgeRef[] } | null {
  if (path.length === 0) return null
  const first = path[0]
  if (first.kind === 'target') return { base: { kind: 'target' }, refs: [] }
  if (first.kind === 'tile') return { base: { kind: 'tile', index: first.index }, refs: [] }
  if (first.kind === 'found') {
    const refs: EdgeRef[] = []
    for (let i = 1; i < path.length; i += 1) {
      const r = segToEdgeRef(path[i])
      if (!r) return null
      refs.push(r)
    }
    return { base: { kind: 'found', index: first.index }, refs }
  }
  const refs: EdgeRef[] = []
  for (const seg of path) {
    const r = segToEdgeRef(seg)
    if (!r) return null
    refs.push(r)
  }
  return { base: { kind: 'current' }, refs }
}

// Index of the token matching the opener at `open` (`[`/`]` or `{`/`}`); -1 if unbalanced.
function matchPair(toks: ReadonlyArray<Tok>, open: number, o: string, c: string): number {
  let depth = 0
  for (let k = open; k < toks.length; k += 1) {
    const x = toks[k]
    if (x.kind === 'sym' && x.text === o) depth += 1
    else if (x.kind === 'sym' && x.text === c) {
      depth -= 1
      if (depth === 0) return k
    } else if (x.kind === 'eof') break
  }
  return -1
}

// Split the tokens [from, endExcl) into top-level comma-separated element ranges (inclusive [start, end]),
// ignoring commas nested in `[ ]` / `{ }` (an inline find-tile body's own move lists).
function splitElems(toks: ReadonlyArray<Tok>, from: number, endExcl: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let start = from
  let bracket = 0
  let brace = 0
  for (let k = from; k < endExcl; k += 1) {
    const x = toks[k]
    if (x.kind !== 'sym') continue
    if (x.text === '[') bracket += 1
    else if (x.text === ']') bracket -= 1
    else if (x.text === '{') brace += 1
    else if (x.text === '}') brace -= 1
    else if (x.text === ',' && bracket === 0 && brace === 0) {
      out.push([start, k - 1])
      start = k + 1
    }
  }
  out.push([start, endExcl - 1])
  return out
}

// The exclusive token index one past a move/morph target that starts at `j` — a `[ … ]` list, an inline
// `find-tile … { … }`, or a plain chain (words/nums joined by `.`/`..`). Returns `j` (empty) when there's
// no target (e.g. the trailing `move` keyword of a directive).
function delimitTarget(toks: ReadonlyArray<Tok>, j: number): number {
  const t = toks[j]
  if (!t || t.kind === 'nl' || t.kind === 'eof') return j
  if (t.kind === 'sym' && t.text === '[') {
    const close = matchPair(toks, j, '[', ']')
    return close === -1 ? toks.length : close + 1
  }
  if (t.kind === 'word' && t.text === 'find-tile') {
    let brace = -1
    for (let k = j; k < toks.length; k += 1) {
      const x = toks[k]
      if (x.kind === 'nl' || x.kind === 'eof') break
      if (x.kind === 'sym' && x.text === '{') {
        brace = k
        break
      }
    }
    if (brace === -1) return j
    const close = matchPair(toks, brace, '{', '}')
    return close === -1 ? toks.length : close + 1
  }
  let k = j
  while (k < toks.length) {
    const x = toks[k]
    if (x.kind === 'word' || x.kind === 'num') k += 1
    else if (x.kind === 'sym' && (x.text === '.' || x.text === '..')) k += 1
    else break
  }
  return k
}

export function scanPaths(programText: string): PathOccurrence[] {
  const lexed = lexProgram(programText)
  if (!lexed.ok) return []
  const toks = lexed.value
  const src = programText
  const occ: PathOccurrence[] = []
  const consumedAt = new Set<number>() // `.` token indices that are move-chain hops (not attribute paths)

  const lineOf = (pos: number): number => {
    let n = 0
    for (let k = 0; k < pos && k < src.length; k += 1) if (src[k] === '\n') n += 1
    return n
  }
  const emit = (span: { start: number; end: number }, lift: { base: OccurrenceBase; refs: EdgeRef[] }): void => {
    occ.push({ span, line: lineOf(span.start), base: lift.base, refs: lift.refs, text: src.slice(span.start, span.end) })
  }

  // Emit occurrences for a delimited move/morph target [j, end). A `[ … ]` splits into per-element spans
  // (so a list's elements light independently and share their line's colour); a plain chain is one span.
  const emitMoveTarget = (j: number, end: number): void => {
    if (toks[j].kind === 'sym' && toks[j].text === '[') {
      const close = matchPair(toks, j, '[', ']')
      if (close === -1) return
      for (const [s, e] of splitElems(toks, j + 1, close)) {
        if (e < s) continue
        const r = parseChainFragment(`[${src.slice(toks[s].start, toks[e].end)}]`)
        if (!r.ok) continue
        for (const chain of r.value) {
          const lift = liftChain(chain)
          if (lift) emit({ start: toks[s].start, end: toks[e].end }, lift)
        }
      }
      return
    }
    const e = end - 1
    if (e < j) return
    const r = parseChainFragment(src.slice(toks[j].start, toks[e].end))
    if (!r.ok) return
    for (const chain of r.value) {
      const lift = liftChain(chain)
      if (lift) emit({ start: toks[j].start, end: toks[e].end }, lift)
    }
  }

  // Pass A — move / morph targets. Mark their `.` hops consumed so Pass B doesn't re-read them as paths.
  let i = 0
  while (i < toks.length) {
    const t = toks[i]
    if (t.kind === 'word' && (t.text === 'move' || t.text === 'morph')) {
      let j = i + 1
      if (t.text === 'morph' && toks[j] && toks[j].kind === 'word') j += 1 // skip the def name
      const end = delimitTarget(toks, j)
      for (let m = j; m < end; m += 1) if (toks[m].kind === 'sym' && toks[m].text === '.') consumedAt.add(m)
      if (end > j && !(toks[j].kind === 'word' && toks[j].text === 'find-tile')) emitMoveTarget(j, end)
      i = Math.max(end, i + 1)
      continue
    }
    i += 1
  }

  // Pass B — attribute/registry/write `.`-path runs everywhere else (guards, put values, write targets).
  let k = 0
  while (k < toks.length) {
    const t = toks[k]
    if (t.kind === 'sym' && t.text === '.' && !consumedAt.has(k)) {
      let m = k
      while (m < toks.length && toks[m].kind === 'sym' && toks[m].text === '.') {
        m += 1 // consume '.'
        const seg = toks[m]
        if (seg && seg.kind === 'word') {
          m += 1
          if (seg.text === 'tile' && toks[m] && toks[m].kind === 'num') m += 1 // `.tile N`
        } else if (seg && seg.kind === 'num') {
          m += 1 // `.1` — invalid; consume so parsePathFragment rejects it and we skip
        } else {
          break // dangling `.` (e.g. `visited.`)
        }
      }
      const lastIdx = m - 1
      if (lastIdx <= k) {
        k += 1
        continue
      }
      const r = parsePathFragment(src.slice(toks[k].start, toks[lastIdx].end))
      if (r.ok) {
        const lift = liftPath(r.value)
        if (lift) {
          const leafIdx = k - 1 >= 0 && toks[k - 1].kind === 'word' ? k - 1 : k
          emit({ start: toks[leafIdx].start, end: toks[lastIdx].end }, lift)
        }
      }
      k = m
      continue
    }
    k += 1
  }

  return occ
}
