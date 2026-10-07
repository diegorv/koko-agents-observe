import { describe, it, expect } from 'vitest'
import {
  RUNNING_IDLE_CUTOFF_MS,
  isSessionRunning,
  isAgentRunning,
  partitionByRunning,
} from './session-status'
import type { Agent } from '@/types'

const NOW = 1_700_000_000_000

function session(overrides: {
  stoppedAt?: number | null
  lastActivity?: number | null
  startedAt?: number
  status?: string
}) {
  return { stoppedAt: null, lastActivity: NOW, startedAt: NOW - 1000, ...overrides }
}

function agent(overrides: Partial<Agent>): Agent {
  return {
    id: 'a',
    sessionId: 's',
    parentAgentId: 's',
    name: null,
    description: null,
    status: 'active',
    eventCount: 1,
    firstEventAt: NOW - 1000,
    lastEventAt: NOW,
    ...overrides,
  }
}

describe('isSessionRunning', () => {
  it('is running when not stopped and recently active', () => {
    expect(isSessionRunning(session({}), NOW)).toBe(true)
  })

  it('is ended once stoppedAt is set', () => {
    expect(isSessionRunning(session({ stoppedAt: NOW - 10 }), NOW)).toBe(false)
  })

  it('ignores a stale status string and reads only stoppedAt', () => {
    expect(isSessionRunning(session({ status: 'ended', stoppedAt: null }), NOW)).toBe(true)
  })

  it('treats a session idle past the cutoff as ended (zombie)', () => {
    const idle = session({ lastActivity: NOW - RUNNING_IDLE_CUTOFF_MS })
    expect(isSessionRunning(idle, NOW)).toBe(false)
  })

  it('stays running just under the cutoff', () => {
    const idle = session({ lastActivity: NOW - RUNNING_IDLE_CUTOFF_MS + 1 })
    expect(isSessionRunning(idle, NOW)).toBe(true)
  })

  it('falls back to startedAt when lastActivity is missing', () => {
    expect(isSessionRunning(session({ lastActivity: null, startedAt: NOW - 5 }), NOW)).toBe(true)
    expect(
      isSessionRunning(
        session({ lastActivity: null, startedAt: NOW - RUNNING_IDLE_CUTOFF_MS - 1 }),
        NOW,
      ),
    ).toBe(false)
  })
})

describe('isAgentRunning', () => {
  it('is running when active and recently seen', () => {
    expect(isAgentRunning(agent({}), NOW)).toBe(true)
  })

  it('is ended when stopped', () => {
    expect(isAgentRunning(agent({ status: 'stopped' }), NOW)).toBe(false)
  })

  it('treats an active agent silent past the cutoff as ended', () => {
    expect(isAgentRunning(agent({ lastEventAt: NOW - RUNNING_IDLE_CUTOFF_MS }), NOW)).toBe(false)
  })
})

describe('partitionByRunning', () => {
  it('splits stably without mutating or cloning items', () => {
    const items = [
      { id: 1, on: false },
      { id: 2, on: true },
      { id: 3, on: false },
      { id: 4, on: true },
    ]
    const snapshot = [...items]
    const { running, ended } = partitionByRunning(items, (i) => i.on)
    expect(running.map((i) => i.id)).toEqual([2, 4])
    expect(ended.map((i) => i.id)).toEqual([1, 3])
    expect(running[0]).toBe(items[1])
    expect(items).toEqual(snapshot)
  })

  it('handles empty input', () => {
    expect(partitionByRunning([], () => true)).toEqual({ running: [], ended: [] })
  })
})
