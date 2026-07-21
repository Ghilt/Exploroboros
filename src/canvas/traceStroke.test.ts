import { describe, it, expect } from 'vitest'
import { extendTrace } from './traceStroke'
import { buildTiling } from './buildTiling'
import { uniqueNeighbors } from '../tiling'

const sq = buildTiling('square', 5) // 5x5 grid

const adjacent = (a: string, b: string) => uniqueNeighbors(sq, a).includes(b)
const isConnected = (p: ReadonlyArray<string>) => p.every((t, i) => i === 0 || adjacent(p[i - 1], t))
const noDupes = (p: ReadonlyArray<string>) => new Set(p).size === p.length

const a = 'sq:1,1'
const b = uniqueNeighbors(sq, a)[0]
const c = uniqueNeighbors(sq, b).find((x) => x !== a) as string

describe('extendTrace', () => {
  it('starts the path on the first tile', () => {
    expect(extendTrace(sq, [], a)).toEqual([a])
  })

  it('appends an edge-adjacent tile', () => {
    expect(extendTrace(sq, [a], b)).toEqual([a, b])
  })

  it('ignores a null tile (pointer off any tile)', () => {
    const path = [a, b]
    expect(extendTrace(sq, path, null)).toBe(path)
  })

  it('ignores re-entering the current head', () => {
    const path = [a, b]
    expect(extendTrace(sq, path, b)).toBe(path)
  })

  it('backtracks to the second-to-last tile', () => {
    expect(extendTrace(sq, [a, b, c], b)).toEqual([a, b])
  })

  it('backtracks all the way to an earlier tile (fast reverse drag)', () => {
    expect(extendTrace(sq, [a, b, c], a)).toEqual([a])
  })

  it('bridges a gap to a non-adjacent tile, staying connected + self-avoiding', () => {
    const start = 'sq:2,2'
    const target = 'sq:2,4' // not adjacent to start — a fast drag skipped the middle tile
    const res = extendTrace(sq, [start], target)
    expect(res[0]).toBe(start)
    expect(res[res.length - 1]).toBe(target)
    expect(res.length).toBeGreaterThan(1)
    expect(isConnected(res)).toBe(true)
    expect(noDupes(res)).toBe(true)
  })

  it('bridges a long jump across the board (the path always reaches the cursor)', () => {
    const res = extendTrace(sq, ['sq:0,0'], 'sq:4,4')
    expect(res[0]).toBe('sq:0,0')
    expect(res[res.length - 1]).toBe('sq:4,4')
    expect(isConnected(res)).toBe(true)
    expect(noDupes(res)).toBe(true)
  })

  it('routes around tiles already in the path when bridging (no reuse)', () => {
    const path = ['sq:0,0', 'sq:0,1', 'sq:0,2']
    const res = extendTrace(sq, path, 'sq:2,2')
    expect(res.slice(0, 3)).toEqual(path) // prefix preserved
    expect(res[res.length - 1]).toBe('sq:2,2')
    expect(isConnected(res)).toBe(true)
    expect(noDupes(res)).toBe(true)
  })
})
