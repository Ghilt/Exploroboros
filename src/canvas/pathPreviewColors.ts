// The colour palette for the traverser path preview — the pulsating lines drawn on the canvas when the
// user selects DSL text, and the matching swatches in the editor gutter. ONE source of truth so the two
// can never drift. Pure (no DOM); a colour is assigned per SOURCE LINE (cycling), so all paths written on
// one line — e.g. the two chains of `move [r1.r2, straight.straight]` — share a colour, and selecting the
// whole program shows each line in its own colour.
//
// ~10 medium-saturation hues, chosen to stay distinct from one another and readable on the light canvas.
// The canvas draw adds a thin contrasting casing under each stroke so they also stand out on dark fills.

const PATH_PREVIEW_COLORS = [
  '#d81e2c', // red
  '#e8730c', // orange
  '#c9a227', // gold
  '#4d9e1f', // green
  '#17a2a2', // teal
  '#2f6fd8', // blue
  '#6a3fd6', // indigo
  '#a828b8', // purple
  '#d6297e', // pink
  '#8a5a2b', // brown
] as const

export function pathPreviewColors(): readonly string[] {
  return PATH_PREVIEW_COLORS
}

// The colour for a 0-based source line, cycling through the palette (negatives wrap too, defensively).
export function colorForLine(line0: number): string {
  const n = PATH_PREVIEW_COLORS.length
  return PATH_PREVIEW_COLORS[((line0 % n) + n) % n]
}
