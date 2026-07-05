// The nav brand mark: a real 3-tile patch of the Kalleboda tiling — octagon (top-left) with a
// wedge nuzzled into each of the two real gaps beside it. Coordinates are lifted verbatim from a
// real generated tiling (src/tiling/generators/kalleboda.ts, tiles oct:0,-1,1 / wdg:0,-1,2 /
// wdg:0,-1,1 — found by walking `uniqueNeighbors` for an octagon's actual wedge neighbours). y is
// flipped (SVG is y-down; the tiling engine is y-up), same as TileMini.

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="-2.064 -5.478 5.128 5.128"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="brandMarkGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="50%" style={{ stopColor: 'var(--accent-2)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--accent-3)' }} />
        </linearGradient>
      </defs>
      <g fill="url(#brandMarkGradient)" stroke="var(--bg)" strokeWidth="0.09" strokeLinejoin="round">
        <polygon points="1.207,-3.914 0.5,-4.621 -0.5,-4.621 -1.207,-3.914 -1.207,-2.914 -0.5,-2.207 0.5,-2.207 1.207,-2.914" />
        <polygon points="0.5,-4.621 1.207,-3.914 1.207,-2.914 2.207,-2.914 2.207,-3.914 2.914,-4.621 2.207,-5.328 1.5,-4.621" />
        <polygon points="-1.207,-0.5 -0.5,-1.207 0.5,-1.207 0.5,-2.207 -0.5,-2.207 -1.207,-2.914 -1.914,-2.207 -1.207,-1.5" />
      </g>
    </svg>
  )
}
