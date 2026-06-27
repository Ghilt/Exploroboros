// Immutable AST edits for the visual editor. A `Path` is the list of child keys from the root Pred
// down to a node (e.g. ['left', 'right'] for a comparison's right operand inside a boolean's left
// side). The visual editor builds the replacement node; `replaceAt` rebuilds the spine to that path.

import type { Expr, Pred } from './types'

export type Path = ReadonlyArray<string>
type Node = Pred | Expr

export function replaceAt(root: Pred, path: Path, node: Node): Pred {
  return replace(root, path, node) as Pred
}

function replace(cur: Node, path: Path, node: Node): Node {
  if (path.length === 0) return node
  const [key, ...rest] = path
  const obj = cur as unknown as Record<string, Node>
  return { ...obj, [key]: replace(obj[key], rest, node) } as unknown as Node
}
