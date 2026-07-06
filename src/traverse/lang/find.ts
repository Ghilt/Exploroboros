// Breadth-first "ghost search" behind the find-tile construct. Pure & isomorphic: given a start hop, a
// way to EXPAND a hop into neighbour hops (the body's ghost moves), and a GOAL test, it returns the
// NEAREST hop (BFS order) that satisfies the goal — never the start tile itself (results are at least one
// hop away) — or null if the search exhausts. A visited set holds each tile to a single enqueue, so on a
// finite tiling it always terminates; `limit` is a belt-and-braces cap on how many tiles are examined.

import type { Hop } from './edges'

type Node = { tile: string; heading: number }

export function bfsFind(start: Node, expand: (node: Node) => Node[], matches: (node: Node) => boolean, limit: number): Hop {
  const visited = new Set<string>([start.tile]) // the start tile is excluded from results
  const queue: Node[] = []
  const enqueue = (n: Node) => {
    if (!visited.has(n.tile)) {
      visited.add(n.tile)
      queue.push(n)
    }
  }
  for (const n of expand(start)) enqueue(n)
  let examined = 0
  while (queue.length > 0 && examined < limit) {
    const node = queue.shift()!
    examined += 1
    if (matches(node)) return node
    for (const n of expand(node)) enqueue(n)
  }
  return null
}
