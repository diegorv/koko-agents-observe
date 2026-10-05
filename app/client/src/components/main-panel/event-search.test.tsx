import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { EventSearch } from './event-search'
import { useUIStore } from '@/stores/ui-store'
import { useRegionShortcuts } from '@/hooks/use-region-shortcuts'

beforeEach(() => {
  vi.useFakeTimers()
  useUIStore.setState({ searchQuery: '' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EventSearch', () => {
  it('debounces typing before updating the store query', () => {
    renderWithProviders(<EventSearch />)

    fireEvent.change(screen.getByPlaceholderText('Search events...'), {
      target: { value: 'bash' },
    })
    expect(useUIStore.getState().searchQuery).toBe('')

    act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(useUIStore.getState().searchQuery).toBe('bash')
  })

  it('drops a pending debounced update on unmount', () => {
    const { unmount } = renderWithProviders(<EventSearch />)

    fireEvent.change(screen.getByPlaceholderText('Search events...'), {
      target: { value: 'bash' },
    })
    unmount()

    act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(useUIStore.getState().searchQuery).toBe('')
  })

  it('clears the query immediately from the clear button', () => {
    useUIStore.setState({ searchQuery: 'bash' })
    renderWithProviders(<EventSearch />)

    const input = screen.getByPlaceholderText('Search events...') as HTMLInputElement
    expect(input.value).toBe('bash')

    fireEvent.click(screen.getByRole('button'))
    expect(useUIStore.getState().searchQuery).toBe('')
    expect(input.value).toBe('')
  })

  it('is focused by the `/` region shortcut', () => {
    function WithShortcuts() {
      useRegionShortcuts()
      return <EventSearch />
    }
    renderWithProviders(<WithShortcuts />)

    fireEvent.keyDown(window, { key: '/' })

    expect(document.activeElement).toBe(screen.getByPlaceholderText('Search events...'))
  })
})
