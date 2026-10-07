import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen, fireEvent, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import { useUIStore } from '@/stores/ui-store'
import { ConstellationView } from './constellation-view'
import { RUNNING_IDLE_CUTOFF_MS } from '@/lib/session-status'
import type { RecentSession } from '@/types'

// The constellation fetches its own activity-windowed sessions; mock that hook.
let mockWindowed: { data: RecentSession[]; isLoading: boolean } = { data: [], isLoading: false }
vi.mock('@/hooks/use-windowed-sessions', () => ({
  useWindowedSessions: () => mockWindowed,
}))

function session(id: string, over: Partial<RecentSession> = {}): RecentSession {
  return {
    id,
    projectId: 1,
    projectSlug: 'alpha',
    projectName: 'alpha',
    slug: id,
    status: 'active',
    startedAt: 0,
    stoppedAt: null,
    metadata: null,
    lastActivity: Date.now(),
    agentClasses: ['ClaudeCode'],
    eventCount: 100,
    agentCount: 3,
    ...over,
  }
}

const props = { sessions: [], isLoading: false, onOpenSession: () => {} }

// The Running now panel repeats slugs/project names, so star queries are
// scoped to the SVG.
// within() is typed for HTMLElement but works on any Element.
const inSvg = (container: HTMLElement) =>
  within(container.querySelector('svg') as unknown as HTMLElement)

afterEach(() => {
  cleanup()
  useUIStore.getState().clearPreviewSession()
  mockWindowed = { data: [], isLoading: false }
})

describe('ConstellationView', () => {
  it('mounts and renders a star + well label per session/project without throwing', () => {
    mockWindowed = {
      data: [
        session('swift-otter'),
        session('calm-harbor', { projectName: 'beta', projectId: 2, projectSlug: 'beta' }),
      ],
      isLoading: false,
    }
    const { container } = renderWithProviders(<ConstellationView {...props} />)
    const svg = inSvg(container)
    expect(svg.getByText('swift-otter')).toBeTruthy()
    expect(svg.getByText('calm-harbor')).toBeTruthy()
    expect(svg.getByText('alpha')).toBeTruthy() // well label
    expect(svg.getByText('beta')).toBeTruthy()
    expect(screen.getByText('Deep Space')).toBeTruthy() // palette control
  })

  it('shows an empty state when there are no sessions in the window', () => {
    mockWindowed = { data: [], isLoading: false }
    renderWithProviders(<ConstellationView {...props} />)
    // Default window is 45m; the controls stay so it can be widened.
    expect(screen.getByText(/No sessions active in the last 45m/i)).toBeTruthy()
    expect(screen.getByText('last')).toBeTruthy()
    expect(screen.getByText('45m')).toBeTruthy()
  })

  it('runs its animation frame without error', () => {
    mockWindowed = { data: [session('a')], isLoading: false }
    let fired = false
    const raf = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        if (!fired) {
          fired = true
          cb(0)
        }
        return 0
      })
    expect(() => renderWithProviders(<ConstellationView {...props} />)).not.toThrow()
    raf.mockRestore()
  })

  it('renders inline sliders and collapses the controls to a gear', () => {
    mockWindowed = { data: [session('a')], isLoading: false }
    renderWithProviders(<ConstellationView {...props} />)
    // sliders present
    expect(screen.getByText('last')).toBeTruthy()
    expect(screen.getByText('zoom')).toBeTruthy()
    expect(screen.getByText('decay τ')).toBeTruthy()
    expect(screen.getByText('Deep Space')).toBeTruthy() // palette visible while expanded

    fireEvent.click(screen.getByLabelText('Hide controls'))
    expect(screen.queryByText('Deep Space')).toBeNull() // body collapsed
    expect(screen.getByLabelText('Show controls')).toBeTruthy() // gear remains

    fireEvent.click(screen.getByLabelText('Show controls'))
    expect(screen.getByText('Deep Space')).toBeTruthy() // expanded again
  })

  it('renders tooltip values as text, never as HTML', () => {
    const payload = '<img src=x onerror="alert(1)">'
    mockWindowed = { data: [session('evil', { projectName: payload })], isLoading: false }
    const { container } = renderWithProviders(<ConstellationView {...props} />)

    fireEvent.mouseMove(inSvg(container).getByText('evil').closest('g.cst-star')!)

    const tooltip = container.querySelector('.cst-tooltip')!
    expect(tooltip.querySelector('img')).toBeNull()
    expect(tooltip.textContent).toContain(payload)
  })

  it('renders an HTML-bearing slug (e.g. from a git branch name) as text', () => {
    const slug = 'feat/<img src=x onerror="alert(1)">:abcd1234'
    mockWindowed = { data: [session('evil', { slug })], isLoading: false }
    const { container } = renderWithProviders(<ConstellationView {...props} />)

    fireEvent.mouseMove(container.querySelector('g.cst-star')!)

    const tooltip = container.querySelector('.cst-tooltip')!
    expect(tooltip.querySelector('img')).toBeNull()
    expect(tooltip.querySelector('.cst-tt-slug')!.textContent).toBe(slug)
  })

  it('sets the sidebar preview on focus and clears it on background click', () => {
    mockWindowed = { data: [session('swift-otter', { projectId: 7 })], isLoading: false }
    const { container } = renderWithProviders(<ConstellationView {...props} />)
    expect(useUIStore.getState().previewSessionId).toBeNull()

    const star = inSvg(container).getByText('swift-otter').closest('g.cst-star')!
    fireEvent.click(star)
    expect(useUIStore.getState().previewSessionId).toBe('swift-otter')
    expect(useUIStore.getState().previewProjectId).toBe(7)

    fireEvent.click(container.querySelector('svg')!)
    expect(useUIStore.getState().previewSessionId).toBeNull()
  })
})

describe('ConstellationView running sessions', () => {
  it('lists running sessions in the Running now panel, not ended ones', () => {
    mockWindowed = {
      data: [
        session('live-one'),
        session('done-one', { stoppedAt: Date.now() - 1000 }),
        session('zombie', { lastActivity: Date.now() - RUNNING_IDLE_CUTOFF_MS - 1 }),
      ],
      isLoading: false,
    }
    renderWithProviders(<ConstellationView {...props} />)
    const panel = screen.getByRole('group', { name: 'Running now (1)' })
    expect(within(panel).getByText('live-one')).toBeTruthy()
    expect(within(panel).queryByText('done-one')).toBeNull()
    expect(within(panel).queryByText('zombie')).toBeNull()
  })

  it('hides the panel when nothing is running', () => {
    mockWindowed = { data: [session('done', { stoppedAt: Date.now() - 1000 })], isLoading: false }
    renderWithProviders(<ConstellationView {...props} />)
    expect(screen.queryByRole('group', { name: /Running now/ })).toBeNull()
  })

  it('caps the list and shows the overflow count', () => {
    mockWindowed = {
      data: Array.from({ length: 10 }, (_, i) => session(`s${i}`)),
      isLoading: false,
    }
    renderWithProviders(<ConstellationView {...props} />)
    const panel = screen.getByRole('group', { name: 'Running now (10)' })
    expect(within(panel).getAllByRole('button')).toHaveLength(8)
    expect(within(panel).getByText('+2 more')).toBeTruthy()
  })

  it('focuses the star when a panel row is clicked, and hides the panel while focused', () => {
    mockWindowed = { data: [session('swift-otter', { projectId: 7 })], isLoading: false }
    renderWithProviders(<ConstellationView {...props} />)
    const panel = screen.getByRole('group', { name: 'Running now (1)' })
    fireEvent.click(within(panel).getByText('swift-otter'))
    expect(useUIStore.getState().previewSessionId).toBe('swift-otter')
    expect(screen.queryByRole('group', { name: /Running now/ })).toBeNull()
  })

  it('renders a panel slug as text, never as HTML', () => {
    const slug = '<img src=x onerror="alert(1)">'
    mockWindowed = { data: [session('evil', { slug })], isLoading: false }
    const { container } = renderWithProviders(<ConstellationView {...props} />)
    expect(container.querySelector('.cst-running img')).toBeNull()
    expect(container.querySelector('.cst-running-slug')!.textContent).toBe(slug)
  })

  it('shows the ring for running sessions only, independent of star opacity', () => {
    mockWindowed = {
      data: [session('live-one'), session('done-one', { stoppedAt: Date.now() - 1000 })],
      isLoading: false,
    }
    // Run the first few rAF callbacks (palette read + one render frame);
    // the cap stops the frame loop from rescheduling forever.
    let calls = 0
    const raf = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        if (calls++ < 3) cb(0)
        return 0
      })
    const { container } = renderWithProviders(<ConstellationView {...props} />)
    raf.mockRestore()
    const rings = [...container.querySelectorAll<SVGCircleElement>('.cst-rings .cst-active-ring')]
    expect(rings).toHaveLength(2)
    const visible = rings.filter((r) => r.style.display !== 'none')
    expect(visible).toHaveLength(1)
    // Rings sit outside every star <g>, so star opacity can't fade them.
    expect(visible[0].closest('g.cst-star')).toBeNull()
  })
})

describe('ConstellationView frame loop', () => {
  it('skips star colour writes on frames where nothing visibly changed', () => {
    // A long-idle session: heat is ~0 and stays there, so after the first
    // draw no frame should rewrite its colour.
    mockWindowed = {
      data: [session('idle', { lastActivity: Date.now() - 6 * 60 * 60 * 1000 })],
      isLoading: false,
    }
    const queue: FrameRequestCallback[] = []
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      queue.push(cb)
      return queue.length
    })
    let t = 1_000_000
    const now = vi.spyOn(Date, 'now').mockImplementation(() => t)
    const step = (ms: number) => {
      t += ms
      const pending = queue.splice(0)
      for (const cb of pending) cb(t)
    }

    const { container } = renderWithProviders(<ConstellationView {...props} />)
    const core = container.querySelector('.cst-core') as SVGCircleElement
    const fillWrites = vi.spyOn(core, 'setAttribute')

    step(16) // palette read + first frame: initial draw
    const afterFirstDraw = fillWrites.mock.calls.filter(([n]) => n === 'fill').length
    expect(afterFirstDraw).toBeGreaterThan(0)

    step(16) // within the visual interval
    step(150) // a visual tick, but heat is unchanged
    step(150)
    const later = fillWrites.mock.calls.filter(([n]) => n === 'fill').length
    expect(later).toBe(afterFirstDraw)

    raf.mockRestore()
    now.mockRestore()
  })
})
