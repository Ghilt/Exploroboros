import './TileMini.css'
import type { TileNode } from '../tiling'
import { clockwiseEdgeOrder, headingArrowDir } from '../tiling'

// A small upright drawing of the selected tile in its ON-CANVAS orientation (world y-up → SVG y-down,
// the same flip the canvas uses), with every edge labelled by its user-facing clockwise-from-top
// number — the exact `edge N` the traverser DSL resolves. Drawn from the tile's REAL vertices, so the
// orientation is faithful: the four wedge rotations and the snub-hexagonal up/down triangles each look
// different, which is the whole point. Edge 0 (the top edge) is drawn in the accent colour to anchor it.
// `straightPairs` are local-side-index pairs joined by a dotted line — a shape's hand-crafted
// straight-through pairing (the wedge). Passed in (computed from the tiling's shape def) since the
// node alone doesn't carry it.
export function TileMini({
  node,
  heading,
  straightPairs,
}: {
  node: TileNode
  heading?: number | null
  straightPairs?: ReadonlyArray<readonly [number, number]>
}) {
  const flip = (v: { x: number; y: number }) => ({ x: v.x, y: -v.y })
  const pts = node.vertices.map(flip)
  const c = flip(node.centroid)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minY = Math.min(...ys)
  let maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const pad = span * 0.42 // room for the edge numbers sitting just outside each edge
  minX -= pad
  maxX += pad
  minY -= pad
  maxY += pad

  // User-facing number for each local side: clockwiseEdgeOrder[userNumber] = localIndex, inverted.
  const order = clockwiseEdgeOrder(node)
  const labelOf: number[] = []
  order.forEach((local, num) => {
    labelOf[local] = num
  })

  const fontSize = span * 0.16
  const off = span * 0.22

  // Edge 0's segment, highlighted to anchor "the top edge".
  const zero = node.sides[order[0]]
  const z0 = flip(zero.geometry.a)
  const z1 = flip(zero.geometry.b)

  // A walker's heading pointer (only when one sits on this tile), matching the canvas head triangle.
  // The direction comes from headingArrowDir, so on a concave wedge the arrow points AT the aimed edge
  // (its midpoint) rather than off along the raw normal, which would visually miss the edge it names.
  let head: string | null = null
  if (heading != null) {
    const dir = headingArrowDir(node, heading)
    const hx = dir.x
    const hy = -dir.y // world y-up -> SVG y-down
    const px = -hy
    const py = hx
    const tip = { x: c.x + hx * span * 0.36, y: c.y + hy * span * 0.36 }
    const back = { x: c.x - hx * span * 0.04, y: c.y - hy * span * 0.04 }
    const hw = span * 0.13
    head = `${tip.x},${tip.y} ${back.x + px * hw},${back.y + py * hw} ${back.x - px * hw},${back.y - py * hw}`
  }

  return (
    <svg
      className="tile-mini"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      role="img"
      aria-label="selected tile, edges numbered clockwise from the top"
    >
      <polygon className="tile-mini-shape" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} vectorEffect="non-scaling-stroke" />
      {straightPairs?.map(([a, b]) => {
        const ma = flip(node.sides[a].geometry.midpoint)
        const mb = flip(node.sides[b].geometry.midpoint)
        return <line key={`${a}-${b}`} className="tile-mini-straight" x1={ma.x} y1={ma.y} x2={mb.x} y2={mb.y} vectorEffect="non-scaling-stroke" />
      })}
      <line className="tile-mini-edge0" x1={z0.x} y1={z0.y} x2={z1.x} y2={z1.y} vectorEffect="non-scaling-stroke" />
      {head && <polygon className="tile-mini-head" points={head} />}
      {node.sides.map((s) => {
        const m = flip(s.geometry.midpoint)
        const lx = m.x + Math.cos(s.geometry.normalAngle) * off
        const ly = m.y - Math.sin(s.geometry.normalAngle) * off
        const num = labelOf[s.geometry.localIndex]
        return (
          <text
            key={s.geometry.localIndex}
            x={lx}
            y={ly}
            fontSize={fontSize}
            textAnchor="middle"
            dominantBaseline="central"
            className={num === 0 ? 'tile-mini-num is-zero' : 'tile-mini-num'}
          >
            {num}
          </text>
        )
      })}
    </svg>
  )
}
