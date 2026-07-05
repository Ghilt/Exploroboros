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
]

// Append a preset's text to the end of the current document (a blank line stays blank; otherwise a
// single newline separates them). Pure, so it's unit-tested.
export function appendPreset(current: string, presetText: string): string {
  return current.trim() === '' ? presetText : `${current.replace(/\n+$/, '')}\n${presetText}`
}
