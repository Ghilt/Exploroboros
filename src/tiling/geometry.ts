// Pure 2D geometry helpers. World is y-up, polygons wound CCW.

import type { Vec2 } from './types'

// Vertices of a regular N-gon, CCW, starting at angle `rotationRad`.
export function regularPolygonVertices(
  center: Vec2,
  circumradius: number,
  n: number,
  rotationRad = 0,
): Vec2[] {
  const verts: Vec2[] = []
  for (let k = 0; k < n; k += 1) {
    const angle = rotationRad + (2 * Math.PI * k) / n
    verts.push({
      x: center.x + circumradius * Math.cos(angle),
      y: center.y + circumradius * Math.sin(angle),
    })
  }
  return verts
}

// Vertex average — exact centroid for the regular/convex tiles we target.
export function centroid(vertices: ReadonlyArray<Vec2>): Vec2 {
  let sx = 0
  let sy = 0
  for (const v of vertices) {
    sx += v.x
    sy += v.y
  }
  const n = vertices.length
  return { x: sx / n, y: sy / n }
}

export function edgeMidpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// A tile's orientation in whole degrees [0, 360): the direction from its centroid to its first
// vertex. This distinguishes rotated copies of the same shape — up vs down triangles, the four wedge
// rotations, the ±15° snub squares — which is what the DSL `rotation` attribute exposes. Rough by
// design; a friendlier per-shape rotation labelling is a later task.
export function tileRotationDeg(vertices: ReadonlyArray<Vec2>, c: Vec2): number {
  const v0 = vertices[0]
  const deg = (Math.atan2(v0.y - c.y, v0.x - c.x) * 180) / Math.PI
  return Math.round(((deg % 360) + 360) % 360)
}

// Shoelace signed area: positive for CCW winding, negative for CW. Generators must wind CCW
// (the outward-normal and side-order semantics depend on it); stitch asserts this.
export function signedArea(vertices: ReadonlyArray<Vec2>): number {
  let sum = 0
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

// Scale a point away from (factor > 1) or toward (factor < 1) a center. Reusable for the
// debug highlight's slight enlargement, and later for edit-mode tile emphasis.
export function scaleAround(p: Vec2, center: Vec2, factor: number): Vec2 {
  return {
    x: center.x + (p.x - center.x) * factor,
    y: center.y + (p.y - center.y) * factor,
  }
}

// Sort key for "clockwise from straight up" (north = +y up): 0 at the top, increasing
// clockwise to 360. Lets edges be numbered the way the UI presents them — 0th edge at the
// top — independent of the internal CCW winding.
export function clockwiseFromTopKey(normalAngle: number): number {
  const deg = (normalAngle * 180) / Math.PI
  return (((90 - deg) % 360) + 360) % 360
}

// Outward normal angle of a CCW side a->b. For CCW winding the interior is on the left,
// so the outward normal is the edge direction rotated -90deg: (dx,dy) -> (dy,-dx).
export function normalAngle(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.atan2(-dx, dy)
}

// Snap a coordinate to a grid of size `tol` (absorbs floating-point drift before keying).
export function quantize(value: number, tol: number): number {
  return Math.round(value / tol)
}

// An order-independent key for an edge segment: two tiles sharing an edge produce the
// same key regardless of which way each winds across it.
export function quantizeKey(a: Vec2, b: Vec2, tol: number): string {
  const pa = `${quantize(a.x, tol)},${quantize(a.y, tol)}`
  const pb = `${quantize(b.x, tol)},${quantize(b.y, tol)}`
  return pa <= pb ? `${pa}|${pb}` : `${pb}|${pa}`
}
