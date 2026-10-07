import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, cleanup } from '@testing-library/react'
import { useNow } from './use-now'

function NowProbe({ onValue }: { onValue: (v: number) => void }) {
  onValue(useNow())
  return null
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('advances on the shared tick and shares one value across subscribers', () => {
    const a: number[] = []
    const b: number[] = []
    render(
      <>
        <NowProbe onValue={(v) => a.push(v)} />
        <NowProbe onValue={(v) => b.push(v)} />
      </>,
    )
    expect(a.at(-1)).toBe(1_000_000)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(a.at(-1)).toBe(1_030_000)
    expect(b.at(-1)).toBe(a.at(-1))
  })

  it('stops the interval once the last subscriber unmounts', () => {
    const { unmount } = render(<NowProbe onValue={() => {}} />)
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
