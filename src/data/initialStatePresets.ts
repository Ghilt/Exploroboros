// Ready-made Initial-state snippets, offered in a dropdown above the pane's textarea. Selecting one
// APPENDS its lines to the end of the document (it never replaces what's there). Each seeds traverser
// t1 by grid-relative auto-place lines; swap t1 for another traverser / registry as needed.

export type InitialStatePreset = { name: string; text: string }

export const INITIAL_STATE_PRESETS: ReadonlyArray<InitialStatePreset> = [
  {
    name: 'Edges',
    text: [
      'auto-place line {t1, 90, 0, 1}',
      'auto-place line {t1, 0, 0, 2}',
      'auto-place line {t1, 90, 100, 3}',
      'auto-place line {t1, 0, 100, 4}',
    ].join('\n'),
  },
  {
    name: 'Cross',
    text: ['auto-place line {t1, 90, 50, 1}', 'auto-place line {t1, 0, 50, 2}'].join('\n'),
  },
  {
    name: 'Diagonal cross',
    text: ['auto-place line {t1, 45, 50, 1}', 'auto-place line {t1, -45, 50, 2}'].join('\n'),
  },
  {
    // One size-1 blob of t1 in each of the four corners, each aimed inward. The heading edge is the
    // square grid's convention (0 = up/N, 1 = right/E, 2 = down/S, 3 = left/W): top corners aim down,
    // bottom corners aim up — into the board. A true diagonal isn't an edge on a square, so this uses the
    // nearest straight direction; on non-square tilings the heading is approximate (edge numbers differ).
    name: 'Corners',
    text: [
      'auto-place blob {t1, 0, 0, 1, 2}',
      'auto-place blob {t1, 100, 0, 1, 2}',
      'auto-place blob {t1, 0, 100, 1, 0}',
      'auto-place blob {t1, 100, 100, 1, 0}',
    ].join('\n'),
  },
  {
    // One size-1 blob of t1 at the middle of each outer edge of the whole tiling, each aimed inward:
    // top → down (2), right → left (3), bottom → up (0), left → right (1). Square-grid edge numbering
    // (see Corners); approximate on non-square tilings.
    name: 'Midpoints',
    text: [
      'auto-place blob {t1, 50, 0, 1, 2}',
      'auto-place blob {t1, 100, 50, 1, 3}',
      'auto-place blob {t1, 50, 100, 1, 0}',
      'auto-place blob {t1, 0, 50, 1, 1}',
    ].join('\n'),
  },
]

// Append a preset's text to the end of the current document (a blank line stays blank; otherwise a
// single newline separates them). Pure, so it's unit-tested.
export function appendPreset(current: string, presetText: string): string {
  return current.trim() === '' ? presetText : `${current.replace(/\n+$/, '')}\n${presetText}`
}
