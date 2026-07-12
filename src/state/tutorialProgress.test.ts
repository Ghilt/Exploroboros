import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTutorialProgress } from './tutorialProgress'

beforeEach(() => localStorage.clear())

describe('useTutorialProgress', () => {
  it('starts empty and marks a chapter complete', () => {
    const { result } = renderHook(() => useTutorialProgress())
    expect(result.current.isComplete('basic-traverser')).toBe(false)
    act(() => result.current.markComplete('basic-traverser'))
    expect(result.current.isComplete('basic-traverser')).toBe(true)
    expect(result.current.completed).toContain('basic-traverser')
  })

  it('markComplete is idempotent', () => {
    const { result } = renderHook(() => useTutorialProgress())
    act(() => {
      result.current.markComplete('a')
      result.current.markComplete('a')
    })
    expect(result.current.completed.filter((x) => x === 'a').length).toBe(1)
  })

  it('persists across a remount', () => {
    const first = renderHook(() => useTutorialProgress())
    act(() => first.result.current.markComplete('basic-traverser'))
    first.unmount()
    const second = renderHook(() => useTutorialProgress())
    expect(second.result.current.isComplete('basic-traverser')).toBe(true)
  })
})
