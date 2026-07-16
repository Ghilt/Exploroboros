// Rhombille tiling ("tumbling blocks") — identical 60°/120° rhombi in three orientations, the dual
// of the trihexagonal (kagome) tiling. Six rhombi meet at each 60° corner (a triangular-lattice
// point); three meet at each 120° corner (a triangle centroid). Built directly from a triangular
// lattice of edge √3: every lattice edge becomes one rhombus whose long diagonal is that edge
// (length √3) and whose short diagonal (length 1) joins the centroids of the two triangles sharing
// it — so each rhombus has unit edges. The three lattice-edge directions give the three orientations.

import type { RawTile, Tiling, TilingMeta, Vec2 } from '../types'
import { centroid } from '../geometry'
import { makeShapeDef } from '../shapes'
import { stitch } from '../stitch'
import { weldVertices, windCCW } from './util'

const L = Math.sqrt(3) // triangular-lattice edge so the rhombi have unit edges
const RHOMBUS = makeShapeDef('rhombus', 4)
const RHOMBUS_AREA = Math.sqrt(3) / 2 // unit rhombus, 60° angle: 1·1·sin60°

const META: TilingMeta = {
  id: 'rhombille',
  name: 'Rhombille',
  vertexConfig: 'rhombi (dual 3.6.3.6)',
  chiral: false,
  edgeToEdge: true,
  // Each up-triangle cell (i, j) owns the three rhombi on its edges; the `face` dimension
  // (0=bottom edge, 1=right edge, 2=left edge) separates them into the three rhombus directions
  // (the three visible faces of a tumbling-block cube). (Not called "orientation" — that name is
  // reserved for the geometry-derived DSL `orientation` attribute shown in Inspect.)
  latticeLabels: ['i', 'j', 'face'],
}

// Triangular lattice point (i, j), edge length L.
function vtx(i: number, j: number): Vec2 {
  return { x: L * (i + 0.5 * j), y: L * (Math.sqrt(3) / 2) * j }
}
function mid3(a: Vec2, b: Vec2, c: Vec2): Vec2 {
  return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 }
}

type Cand = { i: number; j: number; o: number; vertices: Vec2[] }

export function rhombilleTiling(n: number): Tiling {
  const half = Math.max(2, (n / 2) * Math.sqrt(RHOMBUS_AREA))
  const jMax = Math.ceil((half + 2) / (L * (Math.sqrt(3) / 2))) + 1
  const inRegion = (c: Vec2) => c.x >= -half && c.x <= half && c.y >= -half && c.y <= half

  const cands: Cand[] = []
  for (let j = -jMax; j <= jMax; j += 1) {
    const iLo = Math.floor((-half - 2) / L - 0.5 * j)
    const iHi = Math.ceil((half + 2) / L - 0.5 * j)
    for (let i = iLo; i <= iHi; i += 1) {
      // Up-triangle (i, j): A, B, C with centroid Cu.
      const A = vtx(i, j)
      const B = vtx(i + 1, j)
      const C = vtx(i, j + 1)
      const Cu = mid3(A, B, C)
      // Down-triangle centroids across each of the up-triangle's three edges.
      const cdAB = mid3(vtx(i + 1, j - 1), B, A) // across edge A–B (below)
      const cdBC = mid3(B, vtx(i + 1, j + 1), C) // across edge B–C (upper right)
      const cdCA = mid3(A, C, vtx(i - 1, j + 1)) // across edge C–A (upper left)
      cands.push({ i, j, o: 0, vertices: windCCW([A, Cu, B, cdAB]) })
      cands.push({ i, j, o: 1, vertices: windCCW([B, Cu, C, cdBC]) })
      cands.push({ i, j, o: 2, vertices: windCCW([C, Cu, A, cdCA]) })
    }
  }

  const kept = cands.filter((t) => inRegion(centroid(t.vertices)))
  weldVertices(kept, 1e-6)
  const raws: RawTile[] = kept.map((t) => ({
    id: `rh:${t.i},${t.j},${t.o}`,
    shape: 'rhombus',
    lattice: [t.i, t.j, t.o],
    vertices: t.vertices,
  }))
  return stitch(raws, { rhombus: RHOMBUS }, META)
}
