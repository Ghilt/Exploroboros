// Tiny 3×3 pictograms for the tile-numbering segmented control, drawn as the owner sketched them: a
// grid of the numbers 1–9 laid out either in reading rows (normal) or spiralling out from the centre
// (spiral). Pure presentational SVG; digits use currentColor so they follow the control's text colour.
//
//   normal        spiral
//   7 8 9         7 8 9
//   4 5 6         6 1 2
//   1 2 3         5 4 3

const LAYOUTS: Record<'normal' | 'spiral', ReadonlyArray<ReadonlyArray<number>>> = {
  // Rows top → bottom.
  normal: [
    [7, 8, 9],
    [4, 5, 6],
    [1, 2, 3],
  ],
  spiral: [
    [7, 8, 9],
    [6, 1, 2],
    [5, 4, 3],
  ],
}

const COLS = [7, 15, 23]
const ROWS = [7, 15, 23]

export function NumberingIcon({ kind }: { kind: 'normal' | 'spiral' }) {
  const grid = LAYOUTS[kind]
  return (
    <svg
      viewBox="0 0 30 30"
      width="27"
      height="27"
      role="img"
      aria-label={kind === 'normal' ? 'normal numbering' : 'spiral numbering'}
      style={{ display: 'block' }}
    >
      {grid.flatMap((rowVals, r) =>
        rowVals.map((v, c) => (
          <text
            key={`${r}-${c}`}
            x={COLS[c]}
            y={ROWS[r]}
            fontSize="8.5"
            fontWeight={600}
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
            fontFamily="var(--font-mono, ui-monospace, monospace)"
          >
            {v}
          </text>
        )),
      )}
    </svg>
  )
}
