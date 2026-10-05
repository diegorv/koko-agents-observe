import { describe, test, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { EventStore } from '../storage/types'
import projectsRouter from './projects'

type Env = {
  Variables: {
    store: EventStore
    broadcastToSession: (sessionId: string, msg: object) => void
    broadcastToAll: (msg: object) => void
  }
}

describe('GET /api/projects/:id/sessions', () => {
  let app: Hono<Env>
  const mockStore = { getSessionsForProject: vi.fn() }

  beforeEach(() => {
    mockStore.getSessionsForProject.mockReset()
    app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('store', mockStore as unknown as EventStore)
      c.set('broadcastToSession', () => {})
      c.set('broadcastToAll', () => {})
      await next()
    })
    app.route('/api', projectsRouter)
  })

  test('returns null metadata for a corrupt metadata column instead of failing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockStore.getSessionsForProject.mockResolvedValue([
      { id: 'bad', project_id: 1, started_at: 1000, stopped_at: null, metadata: '{not-json' },
      { id: 'good', project_id: 1, started_at: 1000, stopped_at: null, metadata: '{"a":1}' },
    ])

    const res = await app.request('/api/projects/1/sessions')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].metadata).toBeNull()
    expect(body[1].metadata).toEqual({ a: 1 })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
