// Turn scanned path occurrences + the editor's text selection into what the canvas draws (pulsating walks)
// and what the editor's gutter shows (per-line swatches). Pure (no DOM/Konva) so it's unit-testable; the
// tile resolution is injected as `resolve` (= resolveWalk bound to the tiling/overlay/start/heading).

import type { PathOccurrence } from '../traverse'

export type SelSpan = { start: number; end: number }

// One drawable walk: the ordered tile ids, its colour, and the source line it came from (the canvas uses
// tiles+colour; the editor swatch map uses line). Extra `line` is harmless where only {tiles,colour} is read.
export type PathPreviewEntry = { tiles: string[]; color: string; line: number }

// A selection that spans the whole (0..len) text — Ctrl+A. Then every occurrence lights and swatches show.
export function isWholeProgram(sel: SelSpan, textLen: number): boolean {
  return sel.start <= 0 && sel.end >= textLen
}

// Does an occurrence's span fall within the selection? Whole-program lights everything; a collapsed caret
// (start === end) lights nothing (avoids flicker while clicking/typing); otherwise the spans must overlap.
export function occurrenceInSelection(occSpan: SelSpan, sel: SelSpan, textLen: number): boolean {
  if (isWholeProgram(sel, textLen)) return true
  if (sel.start === sel.end) return false
  return occSpan.start < sel.end && sel.start < occSpan.end
}

// Build the drawable walks for the selection: filter occurrences to the selection, resolve each to its
// tiles, drop the unresolvable (empty) ones, and colour each by its source line.
export function buildPathPreview(
  occurrences: readonly PathOccurrence[],
  sel: SelSpan,
  textLen: number,
  resolve: (o: PathOccurrence) => string[],
  color: (line0: number) => string,
): PathPreviewEntry[] {
  const out: PathPreviewEntry[] = []
  for (const o of occurrences) {
    if (!occurrenceInSelection(o.span, sel, textLen)) continue
    const tiles = resolve(o)
    if (tiles.length > 0) out.push({ tiles, color: color(o.line), line: o.line })
  }
  return out
}

// The gutter swatch map (line -> colour), ONLY in whole-program mode (per spec: swatches appear when the
// whole program is selected). One entry per line that produced at least one resolvable walk.
export function lineColorsFor(entries: readonly PathPreviewEntry[], sel: SelSpan, textLen: number): Map<number, string> {
  const m = new Map<number, string>()
  if (!isWholeProgram(sel, textLen)) return m
  for (const e of entries) if (!m.has(e.line)) m.set(e.line, e.color)
  return m
}
