import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { ScopeBar } from './scope-bar'
import { useUIStore } from '@/stores/ui-store'

beforeEach(() => {
  useUIStore.setState({
    selectedProjectId: null,
    selectedProjectSlug: null,
    selectedSessionId: null,
    selectedAgentIds: [],
    expandedEventIds: new Set(),
  })
})

describe('ScopeBar', () => {
  // Regression: unassigned sessions route as `#/_/<sessionId>`, so
  // selectedProjectId is null. The bar (session icons) MUST still render —
  // it previously bailed to null on any falsy project id, so the whole row
  // silently disappeared on unassigned sessions. (In this fork the agent
  // combobox lives in main-panel, not ScopeBar.)
  it('renders for an unassigned session (project id is null)', () => {
    useUIStore.setState({ selectedProjectId: null, selectedSessionId: 'sess-1' })

    renderWithProviders(<ScopeBar />)

    // Session icon buttons (Stats / Edit).
    expect(screen.getByTitle('Session stats')).toBeInTheDocument()
    expect(screen.getByTitle('Edit session')).toBeInTheDocument()
  })

  it('still renders when a project is assigned', () => {
    useUIStore.setState({ selectedProjectId: 1, selectedSessionId: 'sess-1' })

    renderWithProviders(<ScopeBar />)

    expect(screen.getByTitle('Session stats')).toBeInTheDocument()
  })

  it('renders nothing when no session is selected', () => {
    useUIStore.setState({ selectedProjectId: 1, selectedSessionId: null })

    const { container } = renderWithProviders(<ScopeBar />)

    expect(container).toBeEmptyDOMElement()
  })
})
