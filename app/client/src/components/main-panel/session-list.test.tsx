import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { RUNNING_IDLE_CUTOFF_MS } from '@/lib/session-status'
import { SessionList } from './session-list'
import type { RecentSession } from '@/types'

function makeSession(id: string, overrides: Partial<RecentSession> = {}): RecentSession {
  return {
    id,
    projectId: 1,
    projectSlug: 'proj',
    projectName: 'proj',
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

const ended = (id: string) => makeSession(id, { status: 'ended', stoppedAt: Date.now() - 1000 })

describe('SessionList running/ended sections', () => {
  it('renders Running now and Ended sections with counts, keeping caller order', () => {
    renderWithProviders(
      <SessionList sessions={[ended('e1'), makeSession('r1'), ended('e2'), makeSession('r2')]} />,
    )
    const running = screen.getByRole('group', { name: 'Running now (2)' })
    const endedGroup = screen.getByRole('group', { name: 'Ended (2)' })
    const labels = (el: HTMLElement) =>
      within(el)
        .getAllByText(/^[re]\d$/)
        .map((n) => n.textContent)
    expect(labels(running)).toEqual(['r1', 'r2'])
    expect(labels(endedGroup)).toEqual(['e1', 'e2'])
    // Running section comes first in the DOM.
    expect(running.compareDocumentPosition(endedGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('keeps the plain list without headers when nothing is running', () => {
    renderWithProviders(<SessionList sessions={[ended('e1'), ended('e2')]} />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByText('e1')).toBeInTheDocument()
    expect(screen.getByText('e2')).toBeInTheDocument()
  })

  it('omits the Ended section when everything is running', () => {
    renderWithProviders(<SessionList sessions={[makeSession('r1')]} />)
    expect(screen.getByRole('group', { name: 'Running now (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Ended/ })).not.toBeInTheDocument()
  })

  it('reads stoppedAt, not the possibly stale status string', () => {
    renderWithProviders(
      <SessionList sessions={[makeSession('r1', { status: 'ended', stoppedAt: null })]} />,
    )
    expect(screen.getByRole('group', { name: 'Running now (1)' })).toBeInTheDocument()
  })

  it('moves a session idle past the cutoff to Ended', () => {
    const zombie = makeSession('z1', { lastActivity: Date.now() - RUNNING_IDLE_CUTOFF_MS - 1 })
    renderWithProviders(<SessionList sessions={[makeSession('r1'), zombie]} />)
    const endedGroup = screen.getByRole('group', { name: 'Ended (1)' })
    expect(within(endedGroup).getByText('z1')).toBeInTheDocument()
  })

  it('shows the empty state when there are no sessions', () => {
    renderWithProviders(<SessionList sessions={[]} />)
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
  })
})
