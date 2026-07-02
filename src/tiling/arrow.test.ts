import { describe, it, expect } from 'vitest'
import { squareTiling, kallebodaTiling } from './index'
import { headingArrowDir, nodeById, clockwiseEdgeOrder, across } from './graph'

// headingArrowDir turns a heading (an EDGE NUMBER) into the unit direction the arrow should point:
// straight at that edge's midpoint. Truthful on convex and concave tiles alike, no special cases.

const unit = (v: { x: number; y: number }) => {
  const l = Math.hypot(v.x, v.y) || 1
  return { x: v.x / l, y: v.y / l }
}
const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y

function checkPointsAtEdges(t: ReturnType<typeof squareTiling>, id: string) {
  const node = nodeById(t, id)!
  const order = clockwiseEdgeOrder(node)
  for (let k = 0; k < order.length; k += 1) {
    const mid = node.sides[order[k]].geometry.midpoint
    const toMid = unit({ x: mid.x - node.centroid.x, y: mid.y - node.centroid.y })
    const dir = headingArrowDir(node, k)
    expect(dot(dir, toMid), `edge ${k} points at its midpoint`).toBeGreaterThan(0.9999)
  }
}

describe('headingArrowDir', () => {
  it('points at the heading edge midpoint on a convex square', () => {
    checkPointsAtEdges(squareTiling(5, 5), 'sq:2,2')
  })

  it('points at the heading edge midpoint on the concave wedge (no misfire across the body)', () => {
    const t = kallebodaTiling(20)
    const wedge = t.nodes.find((n) => n.shape === 'wedge' && n.sides.every((s) => across(t, n.id, s.geometry.localIndex)))!
    checkPointsAtEdges(t, wedge.id)
  })

  it('wraps the edge index (heading n = heading 0)', () => {
    const t = squareTiling(5, 5)
    const node = nodeById(t, 'sq:2,2')!
    const a = headingArrowDir(node, 0)
    const b = headingArrowDir(node, node.sides.length)
    expect(a).toEqual(b)
  })
})
