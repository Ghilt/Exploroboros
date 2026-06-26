import './TilingDebugView.css'
import type { Tiling, Vec2 } from '../tiling'
import { nodeById } from '../tiling'

// A static, zoomless SVG view of a tiling for inspecting the engine output. It only reads
// the Tiling; it has no interaction. The real interactive plane (pan/zoom/hit-testing) is
// a later phase and will be a separate renderer behind this same prop shape (CLAUDE.md §4.1).

type Props = {
  tiling: Tiling
  showIds?: boolean
  showBoundary?: boolean
  showAdjacency?: boolean
}

export function TilingDebugView({ tiling, showIds = false, showBoundary = false, showAdjacency = false }: Props) {
  const { bounds, nodes, edges } = tiling
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const collapsed = !(width > 0) || !(height > 0)
  const pad = collapsed ? 0 : 0.02 * Math.max(width, height)

  // World is y-up; SVG is y-down. Flip y once here. Flipping each coordinate (rather than a
  // group scale(1,-1)) keeps <text> upright. The flip is about the content centre, so the
  // viewBox y-range is unchanged.
  const fy = (y: number) => bounds.minY + bounds.maxY - y
  const points = (vertices: ReadonlyArray<Vec2>) => vertices.map((v) => `${v.x},${fy(v.y)}`).join(' ')

  // preserveAspectRatio fits the whole tiling into any box (letterboxed) — no manual scale
  // maths, no scroll. Guard a collapsed/empty tiling against an invalid viewBox.
  const viewBox = collapsed
    ? '0 0 1 1'
    : `${bounds.minX - pad} ${bounds.minY - pad} ${width + 2 * pad} ${height + 2 * pad}`

  return (
    <svg
      className="tiling-debug"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${tiling.meta.name}, ${nodes.length} tiles`}
    >
      <g className="tiling-tiles">
        {nodes.map((t) => (
          <polygon
            key={t.id}
            className={`tiling-tile shape-${t.shape}`}
            points={points(t.vertices)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {showAdjacency && (
        <g className="tiling-adjacency">
          {edges.map((e) => {
            if (e.b === null) return null
            const a = nodeById(tiling, e.a.tile)?.centroid
            const b = nodeById(tiling, e.b.tile)?.centroid
            if (!a || !b) return null
            return <line key={e.id} x1={a.x} y1={fy(a.y)} x2={b.x} y2={fy(b.y)} vectorEffect="non-scaling-stroke" />
          })}
        </g>
      )}

      {showBoundary && (
        <g className="tiling-boundary">
          {edges.map((e) =>
            e.b === null ? (
              <line key={e.id} x1={e.p.x} y1={fy(e.p.y)} x2={e.q.x} y2={fy(e.q.y)} vectorEffect="non-scaling-stroke" />
            ) : null,
          )}
        </g>
      )}

      {showIds && (
        <g className="tiling-labels">
          {nodes.map((t) => (
            <text key={t.id} x={t.centroid.x} y={fy(t.centroid.y)} textAnchor="middle" dominantBaseline="central">
              {t.id}
            </text>
          ))}
        </g>
      )}
    </svg>
  )
}
