import { describe, test, expect, vi, afterEach } from 'vitest'
import { resolve } from 'path'
import { resolveHostDbPath } from './config'

describe('resolveHostDbPath (issue #21)', () => {
  test('passes a Windows host path through verbatim (no container prefix)', () => {
    // Regression: resolve() inside the Linux container treated C:\... as
    // relative and produced /app/server/C:\Users\... on /api/health.
    const win = 'C:\\Users\\me\\.koko-agents-observe\\data\\observe.db'
    expect(resolveHostDbPath(win, '/data/observe.db')).toBe(win)
  })

  test('passes a POSIX host path through verbatim', () => {
    const host = '/home/me/.koko-agents-observe/data/observe.db'
    expect(resolveHostDbPath(host, '/data/observe.db')).toBe(host)
  })

  test('falls back to the resolved DB path in local mode (no host path)', () => {
    expect(resolveHostDbPath('', '/home/me/data/observe.db')).toBe('/home/me/data/observe.db')
    expect(resolveHostDbPath(undefined, '/home/me/data/observe.db')).toBe(
      '/home/me/data/observe.db',
    )
  })

  test('resolves a relative fallback DB path', () => {
    expect(resolveHostDbPath('', 'data/observe.db')).toBe(resolve('data/observe.db'))
  })
})

describe('config.bindHost default', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function loadBindHost(env: Record<string, string>): Promise<string> {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    vi.resetModules()
    const { config } = await import('./config')
    return config.bindHost
  }

  test('defaults to loopback outside docker when unset', async () => {
    expect(
      await loadBindHost({ AGENTS_OBSERVE_BIND_HOST: '', AGENTS_OBSERVE_RUNTIME: 'local' }),
    ).toBe('127.0.0.1')
  })

  test('defaults to 0.0.0.0 inside docker when unset', async () => {
    expect(
      await loadBindHost({ AGENTS_OBSERVE_BIND_HOST: '', AGENTS_OBSERVE_RUNTIME: 'docker' }),
    ).toBe('0.0.0.0')
  })

  test('an explicit AGENTS_OBSERVE_BIND_HOST wins over the runtime default', async () => {
    expect(
      await loadBindHost({ AGENTS_OBSERVE_BIND_HOST: '0.0.0.0', AGENTS_OBSERVE_RUNTIME: 'local' }),
    ).toBe('0.0.0.0')
    expect(
      await loadBindHost({
        AGENTS_OBSERVE_BIND_HOST: '192.168.1.5',
        AGENTS_OBSERVE_RUNTIME: 'docker',
      }),
    ).toBe('192.168.1.5')
  })
})

describe('config.shutdownDelayMs default', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('defaults to 5 minutes when unset', async () => {
    vi.stubEnv('AGENTS_OBSERVE_SHUTDOWN_DELAY_MS', '')
    vi.resetModules()
    const { config } = await import('./config')
    expect(config.shutdownDelayMs).toBe(300_000)
  })
})
