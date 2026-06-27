import './TilingDebugView.css'
import type { Tiling, TileNode, Vec2 } from '../tiling'
import { nodeById, scaleAround } from '../tiling'

// A static, zoomless SVG view of a tiling for inspecting the engine output. The interactive
// plane (pan/zoom/hit-testing) is a later phase and will be a separate renderer behind this
// same prop shape (CLAUDE.md §4.1).

type Props = {
  tiling: Tiling
  showNumbers?: boolean // per-tile index labels; the visited 'vN' badge always shows when > 0
  selectedId?: string | null
  visited?: ReadonlyMap<string, number>
  onSelect?: (id: string) => void
  tileNumber?: (id: string) => number
}

// How much a selected tile grows. Applied via scaleAround so edit mode can reuse the same
// emphasis later.
const HIGHLIGHT_SCALE = 1.2

export function TilingDebugView({
  tiling,
  showNumbers = false,
  selectedId = null,
  visited,
  onSelect,
  tileNumber,
}: Props) {
  const { bounds, nodes } = tiling
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const collapsed = !(width > 0) || !(height > 0)
  const pad = collapsed ? 0 : 0.04 * Math.max(width, height)

  // World is y-up; SVG is y-down. Flip y once here (keeps text upright, unlike scale(1,-1)).
  const fy = (y: number) => bounds.minY + bounds.maxY - y
  const toPoints = (verts: ReadonlyArray<Vec2>) => verts.map((v) => `${v.x},${fy(v.y)}`).join(' ')

  const viewBox = collapsed
    ? '0 0 1 1'
    : `${bounds.minX - pad} ${bounds.minY - pad} ${width + 2 * pad} ${height + 2 * pad}`

  const selected = selectedId ? nodeById(tiling, selectedId) ?? null : null
  const anyVisited = visited ? [...visited.values()].some((v) => v > 0) : false

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
            className={`tiling-tile${onSelect ? ' clickable' : ''}${t.id === selectedId ? ' is-selected' : ''}`}
            points={toPoints(t.vertices)}
            vectorEffect="non-scaling-stroke"
            onClick={onSelect ? () => onSelect(t.id) : undefined}
          />
        ))}
      </g>

      {(showNumbers || anyVisited) && (
        <g className="tiling-labels" pointerEvents="none">
          {nodes.map((t) => {
            const v = visited?.get(t.id) ?? 0
            if (!showNumbers && v <= 0) return null
            return (
              <g key={`label-${t.id}`}>
                {showNumbers && (
                  <text
                    className="tile-num"
                    x={t.centroid.x}
                    y={fy(t.centroid.y) + (v > 0 ? -0.08 : 0.06)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={0.3}
                  >
                    {tileNumber ? tileNumber(t.id) : ''}
                  </text>
                )}
                {v > 0 && (
                  <text
                    className="tile-visited"
                    x={t.centroid.x}
                    y={fy(t.centroid.y) + (showNumbers ? 0.3 : 0.06)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={0.26}
                  >
                    {`v${v}`}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      )}

      {selected && <SelectionOverlay node={selected} fy={fy} />}
    </svg>
  )
}

// The clicked tile, drawn slightly enlarged on top as a highlight. (Edge-numbering /
// opposite-edge visualisation is deferred — see CLAUDE.md §8.)
function SelectionOverlay({ node, fy }: { node: TileNode; fy: (y: number) => number }) {
  const big = node.vertices.map((v) => scaleAround(v, node.centroid, HIGHLIGHT_SCALE))
  const points = big.map((v) => `${v.x},${fy(v.y)}`).join(' ')
  return (
    <g className="tiling-selection" pointerEvents="none">
      <polygon className="tiling-selected" points={points} vectorEffect="non-scaling-stroke" />
    </g>
  )
}
