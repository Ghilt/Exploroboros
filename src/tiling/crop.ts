// Crop a tiling down to a centered rectangle of a given aspect, re-stitching the kept tiles into a
// fresh Tiling. Pure & isomorphic (no DOM).
//
// Why: every generator except the square lays tiles into a SQUARE region from a single count, so a
// lopsided export (e.g. 1:8) would otherwise show a small square patch adrift in the middle of the
// frame. buildTiling builds the square patch at the LONGER of the two tile counts (so the long axis
// has enough tiles), then this trims the short axis to the requested w:h ratio — the tiling now FILLS
// the frame, matching how the square tiling already behaves.

import type { RawTile, Tiling } from './types'
import { stitch } from './stitch'

// Keep the tiles whose centroid falls inside the largest centered rectangle of aspect w:h that fits
// the tiling's current bounds, then re-stitch. A square request (w === h) is returned unchanged.
// stitch() is fully generic, so the kept subset rebuilds valid adjacency + boundary edges + bounds;
// tile ids/lattice are preserved. Never crops to nothing (a degenerate result returns the input).
export function cropTilingToAspect(tiling: Tiling, w: number, h: number): Tiling {
  if (w === h || w <= 0 || h <= 0) return tiling
  const { minX, minY, maxX, maxY } = tiling.bounds
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const halfW = (maxX - minX) / 2
  const halfH = (maxY - minY) / 2
  if (!(halfW > 0) || !(halfH > 0)) return tiling

  // Largest w:h rectangle that fits the (roughly square) bounds: whichever axis is the binding one
  // keeps its full half-extent; the other is trimmed to the ratio. (Built at count = max(w, h), so the
  // binding axis is the long one and keeps every tile, while the short axis gets trimmed.)
  const targetAspect = w / h // width / height
  let keepHX: number
  let keepHY: number
  if (targetAspect < halfW / halfH) {
    keepHY = halfH
    keepHX = halfH * targetAspect
  } else {
    keepHX = halfW
    keepHY = halfW / targetAspect
  }

  // A hair of tolerance so a tile whose centroid sits exactly on the cut isn't dropped.
  const eps = 1e-9
  const raws: RawTile[] = []
  for (const n of tiling.nodes) {
    if (Math.abs(n.centroid.x - cx) <= keepHX + eps && Math.abs(n.centroid.y - cy) <= keepHY + eps) {
      raws.push({ id: n.id, shape: n.shape, vertices: n.vertices, lattice: n.lattice })
    }
  }
  if (raws.length === 0 || raws.length === tiling.nodes.length) return tiling
  return stitch(raws, tiling.shapes, tiling.meta)
}
