import { describe, test, expect } from 'vitest'
import { resolve } from 'path'
import { resolveHostDbPath } from './config'

describe('resolveHostDbPath (issue #21)', () => {
  test('passes a Windows host path through verbatim (no container prefix)', () => {
    // Regression: resolve() inside the Linux container treated C:\... as
    // relative and produced /app/server/C:\Users\... on /api/health.
    const win = 'C:\\Users\\me\\.agents-observe\\data\\observe.db'
    expect(resolveHostDbPath(win, '/data/observe.db')).toBe(win)
  })

  test('passes a POSIX host path through verbatim', () => {
    const host = '/home/me/.agents-observe/data/observe.db'
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
