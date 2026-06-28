import { describe, it, expect } from 'vitest'
import {
  makeTraverser,
  uniqueName,
  withAdded,
  withRemoved,
  withRenamed,
  withSetText,
  type StoredTraverser,
} from './traverserStore'

const list: StoredTraverser[] = [makeTraverser('walker'), makeTraverser('spinner', 'move r1')]

describe('traverserStore pure helpers', () => {
  it('generates a unique default name', () => {
    expect(uniqueName([])).toBe('walker')
    expect(uniqueName(list)).toBe('walker-2')
    expect(uniqueName([...list, makeTraverser('walker-2')])).toBe('walker-3')
  })

  it('adds, renames, sets text, and removes by id', () => {
    const added = withAdded(list, makeTraverser('extra'))
    expect(added).toHaveLength(3)
    const renamed = withRenamed(list, list[0].id, 'flood')
    expect(renamed[0].name).toBe('flood')
    const retext = withSetText(list, list[1].id, 'move l1')
    expect(retext[1].text).toBe('move l1')
    const removed = withRemoved(list, list[0].id)
    expect(removed.map((t) => t.name)).toEqual(['spinner'])
  })
})
