import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { LabelList } from './label-list'
import { useUIStore } from '@/stores/ui-store'
import type { RecentSession } from '@/types'

const mockSessions: RecentSession[] = []
vi.mock('@/hooks/use-recent-sessions', () => ({
  useRecentSessions: () => ({ data: mockSessions }),
}))

function makeSession(id: string, overrides: Partial<RecentSession> = {}): RecentSession {
  return {
    id,
    projectId: 1,
    projectSlug: 'p',
    projectName: 'P',
    slug: id,
    status: 'active',
    startedAt: Date.now() - 60_000,
    stoppedAt: null,
    metadata: null,
    lastActivity: Date.now(),
    agentClasses: [],
    ...overrides,
  }
}

function setup(sessions: RecentSession[]) {
  mockSessions.length = 0
  mockSessions.push(...sessions)
  useUIStore.setState({
    labels: [{ id: 'l1', name: 'Work', createdAt: Date.now() }],
    labelMemberships: new Map([['l1', new Set(sessions.map((s) => s.id))]]),
  })
  renderWithProviders(<LabelList collapsed={false} />)
  fireEvent.click(screen.getByText('Work'))
}

const ended = (id: string) => makeSession(id, { status: 'ended', stoppedAt: Date.now() - 1000 })

describe('LabelList running/ended sections', () => {
  beforeEach(() => {
    mockSessions.length = 0
  })

  it('splits label sessions into Running now and Ended groups', () => {
    setup([ended('e1'), makeSession('r1')])
    const runningGroup = screen.getByRole('group', { name: 'Running now (1)' })
    expect(within(runningGroup).getByText('r1')).toBeInTheDocument()
    const endedGroup = screen.getByRole('group', { name: 'Ended (1)' })
    expect(within(endedGroup).getByText('e1')).toBeInTheDocument()
  })

  it('shows the sort toggle once, inside the Running header', () => {
    setup([ended('e1'), makeSession('r1')])
    expect(screen.getAllByText('Recent')).toHaveLength(1)
    const runningGroup = screen.getByRole('group', { name: 'Running now (1)' })
    expect(within(runningGroup).getByText('Recent')).toBeInTheDocument()
  })

  it('keeps date groups without status headers when nothing is running', () => {
    setup([ended('e1')])
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getAllByText('Recent')).toHaveLength(1)
    expect(screen.getByText('e1')).toBeInTheDocument()
  })
})
