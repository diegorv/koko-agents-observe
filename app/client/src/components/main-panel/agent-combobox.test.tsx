import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import { useUIStore } from '@/stores/ui-store'
import { RUNNING_IDLE_CUTOFF_MS } from '@/lib/session-status'
import { AgentCombobox } from './agent-combobox'
import type { Agent } from '@/types'

// cmdk scrolls the active item into view; jsdom doesn't implement it.
Element.prototype.scrollIntoView = vi.fn()

const mockAgents: Agent[] = []
vi.mock('@/hooks/use-events', () => ({ useEvents: () => ({ data: [] }) }))
vi.mock('@/hooks/use-agents', () => ({ useAgents: () => mockAgents }))

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
  mockAgents.length = 0
  mockAgents.push(...agents)
}

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: /Agents/ }))
}

const groupOf = (heading: string) =>
  screen.getByText(heading).closest('[cmdk-group]') as HTMLElement

describe('AgentCombobox running/ended groups', () => {
  beforeEach(() => {
    useUIStore.setState({ selectedSessionId: 'sess-1', selectedAgentIds: [] })
  })

  it('counts running agents including Main in the trigger', () => {
    setAgents([
      makeAgent('sess-1', { parentAgentId: null }),
      makeAgent('run-a'),
      makeAgent('end-a', { status: 'stopped' }),
    ])
    renderWithProviders(<AgentCombobox />)
    expect(screen.getByText('2 active')).toBeInTheDocument()
  })

  it('splits subagents into Running now and Ended, with Main pinned on top', () => {
    setAgents([
      makeAgent('sess-1', { parentAgentId: null, status: 'stopped' }),
      makeAgent('run-a'),
      makeAgent('end-a', { status: 'stopped' }),
      makeAgent('zombie', { lastEventAt: Date.now() - RUNNING_IDLE_CUTOFF_MS - 1 }),
    ])
    renderWithProviders(<AgentCombobox />)
    openPopover()

    expect(within(groupOf('Running now (1)')).getByText('run-a')).toBeInTheDocument()
    const endedGroup = groupOf('Ended (2)')
    expect(within(endedGroup).getByText('end-a')).toBeInTheDocument()
    expect(within(endedGroup).getByText('zombie')).toBeInTheDocument()
    // Main (stopped between turns) is not moved into Ended.
    expect(within(endedGroup).queryByText('Main')).not.toBeInTheDocument()
    expect(screen.getByText('Main')).toBeInTheDocument()
  })

  it('omits empty groups', () => {
    setAgents([makeAgent('sess-1', { parentAgentId: null }), makeAgent('run-a')])
    renderWithProviders(<AgentCombobox />)
    openPopover()
    expect(screen.getByText('Running now (1)')).toBeInTheDocument()
    expect(screen.queryByText(/^Ended \(/)).not.toBeInTheDocument()
  })

  it('filters by agent name across groups', async () => {
    setAgents([
      makeAgent('sess-1', { parentAgentId: null }),
      makeAgent('run-a'),
      makeAgent('end-b', { status: 'stopped' }),
    ])
    renderWithProviders(<AgentCombobox />)
    openPopover()
    await userEvent.type(screen.getByPlaceholderText('Search agents...'), 'end-b')
    expect(screen.getByText('end-b')).toBeInTheDocument()
    expect(screen.queryByText('run-a')).not.toBeInTheDocument()

    await userEvent.clear(screen.getByPlaceholderText('Search agents...'))
    await userEvent.type(screen.getByPlaceholderText('Search agents...'), 'nothing-matches')
    expect(screen.getByText('No agents found.')).toBeInTheDocument()
  })
})
