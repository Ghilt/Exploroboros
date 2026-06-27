import { describe, it, expect } from 'vitest'
import { parsePredicate } from './parse'
import { serialize } from './serialize'
import { replaceAt } from './edit'
import type { Pred } from './types'

function ast(src: string): Pred {
  const r = parsePredicate(src)
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}

describe('replaceAt', () => {
  it('replaces the root', () => {
    const next = replaceAt(ast('visited > 0'), [], ast('edge-count == 4'))
    expect(serialize(next)).toBe('edge-count == 4')
  })

  it('swaps an operator deep in the tree without mutating the input', () => {
    const root = ast('visited % 2 == 1 and registry-a > 0')
    // path to the right comparison's operator: bool.right is the compare; set its op to '>='
    const right = root.kind === 'bool' ? root.right : null
    if (!right || right.kind !== 'compare') throw new Error('unexpected shape')
    const next = replaceAt(root, ['right'], { ...right, op: '>=' })
    expect(serialize(next)).toBe('visited % 2 == 1 and registry-a >= 0')
    expect(serialize(root)).toBe('visited % 2 == 1 and registry-a > 0') // original untouched
  })

  it('replaces an operand expression', () => {
    const root = ast('visited == 1')
    if (root.kind !== 'compare') throw new Error('unexpected')
    const next = replaceAt(root, ['left'], { kind: 'attr', name: 'edge-count', scope: 'tile' })
    expect(serialize(next)).toBe('edge-count == 1')
  })
})
