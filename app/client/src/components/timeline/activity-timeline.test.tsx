import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { useUIStore } from '@/stores/ui-store'
import { ActivityTimeline } from './activity-timeline'
import type { Agent } from '@/types'

// Reassigned (not mutated) per update, like the real useAgents result.
let mockAgents: Agent[] = []
let mockSessions: {
  id: string
  stoppedAt: number | null
  startedAt: number
  lastActivity: number
}[] = []
vi.mock('@/hooks/use-sessions', () => ({ useSessions: () => ({ data: mockSessions }) }))
vi.mock('@/hooks/use-effective-events', () => ({ useEffectiveEvents: () => ({ data: [] }) }))
vi.mock('@/hooks/use-agents', () => ({ useAgents: () => mockAgents }))
vi.mock('@/agents/event-processing-context', () => ({
  useProcessedEvents: () => ({ events: [] }),
}))

function makeAgent(id: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    sessionId: 'sess-1',
    parentAgentId: 'sess-1',
    name: id,
    description: null,
    status: 'active',
    eventCount: 1,
    firstEventAt: Date.now() - 1000,
    lastEventAt: Date.now(),
    ...overrides,
  }
}

function setAgents(agents: Agent[]) {
  mockAgents = [...agents]
}

/** Lane rows in DOM order, by the agent name shown in each lane button. */
function laneButton(name: string) {
  return screen.getByText(name).closest('button') as HTMLElement
}

describe('ActivityTimeline running/ended lanes', () => {
  beforeEach(() => {
    useUIStore.setState({ selectedSessionId: 'sess-1', selectedAgentIds: [], rewindMode: false })
    mockSessions = []
  })

  it('puts every subagent below the divider once the session has ended', () => {
    mockSessions = [
      { id: 'sess-1', stoppedAt: Date.now() - 1000, startedAt: 0, lastActivity: Date.now() },
    ]
    setAgents([makeAgent('sess-1', { parentAgentId: null }), makeAgent('run-a')])
    renderWithProviders(<ActivityTimeline />)
    const divider = screen.getByText('Ended (1)')
    expect(
      divider.compareDocumentPosition(laneButton('run-a')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('places an Ended divider between running and ended lanes', () => {
    setAgents([
      makeAgent('sess-1', { parentAgentId: null }),
      makeAgent('end-a', { status: 'stopped' }),
      makeAgent('run-a'),
    ])
    renderWithProviders(<ActivityTimeline />)
    const divider = screen.getByText('Ended (1)')
    const follows = (a: Node, b: Node) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(laneButton('run-a'), divider)).toBe(true)
    expect(follows(divider, laneButton('end-a'))).toBe(true)
  })

  it('mutes only the name button of ended lanes, never with opacity', () => {
    setAgents([
      makeAgent('sess-1', { parentAgentId: null }),
      makeAgent('end-a', { status: 'stopped' }),
    ])
    renderWithProviders(<ActivityTimeline />)
    const btn = laneButton('end-a')
    expect(btn.className).toContain('text-muted-foreground')
    // Same opacity classes as any subagent lane — nothing extra.
    const opacity = btn.className.split(' ').filter((c) => c.includes('opacity'))
    expect(opacity).toEqual(['opacity-80', 'dark:opacity-50'])
  })

  it('omits the divider when there are no ended lanes', () => {
    setAgents([makeAgent('sess-1', { parentAgentId: null }), makeAgent('run-a')])
    renderWithProviders(<ActivityTimeline />)
    expect(screen.queryByText(/^Ended \(/)).not.toBeInTheDocument()
  })

  it('moves a lane across the divider without remounting it', () => {
    setAgents([
      makeAgent('sess-1', { parentAgentId: null }),
      makeAgent('run-a'),
      makeAgent('run-b'),
    ])
    const { rerender } = renderWithProviders(<ActivityTimeline />)
    const laneBefore = laneButton('run-a').parentElement

    setAgents([
      makeAgent('sess-1', { parentAgentId: null }),
      makeAgent('run-a', { status: 'stopped' }),
      makeAgent('run-b'),
    ])
    rerender(<ActivityTimeline />)
    expect(screen.getByText('Ended (1)')).toBeInTheDocument()
    expect(laneButton('run-a').parentElement).toBe(laneBefore)
  })
})
