import { describe, it, expect } from 'vitest'
import { bfsFind } from './find'

// Synthetic graphs (no tiling needed) exercise the pure BFS: `expand` gives a node's neighbours, `matches`
// is the goal test. Nodes carry a heading the search doesn't care about here (use 0).
type N = { tile: string; heading: number }
const n = (tile: string): N => ({ tile, heading: 0 })

// A line 0—1—2—…—9: each tile's neighbours are the numbers either side.
const line = (node: N): N[] => {
  const i = Number(node.tile)
  return [i - 1, i + 1].filter((k) => k >= 0 && k <= 9).map((k) => n(String(k)))
}

describe('bfsFind', () => {
  it('returns the nearest matching tile (BFS order), never the start tile', () => {
    const hit = bfsFind(n('0'), line, (x) => x.tile === '5', 100)
    expect(hit?.tile).toBe('5')
  })

  it('excludes the start tile even when it matches', () => {
    // Only tile 3 matches; searching FROM 3 must look outward and find nothing else matching.
    const hit = bfsFind(n('3'), line, (x) => x.tile === '3', 100)
    expect(hit).toBeNull()
  })

  it('picks the closer of two matches', () => {
    // From 4, both 2 and 7 match; 2 is distance 2, 7 is distance 3 → 2 wins.
    const hit = bfsFind(n('4'), line, (x) => x.tile === '2' || x.tile === '7', 100)
    expect(hit?.tile).toBe('2')
  })

  it('returns null when nothing matches', () => {
    expect(bfsFind(n('0'), line, () => false, 100)).toBeNull()
  })

  it('terminates on a cyclic graph via the visited set', () => {
    const ring = (node: N): N[] => {
      const i = Number(node.tile)
      return [n(String((i + 1) % 4)), n(String((i + 3) % 4))] // a 4-cycle 0-1-2-3-0
    }
    expect(bfsFind(n('0'), ring, (x) => x.tile === '2', 100)?.tile).toBe('2')
    expect(bfsFind(n('0'), ring, () => false, 100)).toBeNull() // would loop forever without the visited set
  })

  it('stops after `limit` tiles examined', () => {
    // A match sits at distance 5, but a limit of 3 gives up first.
    expect(bfsFind(n('0'), line, (x) => x.tile === '5', 3)).toBeNull()
  })
})
