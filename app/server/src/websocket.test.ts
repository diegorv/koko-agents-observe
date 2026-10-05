import { describe, it, expect, vi, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
import { shouldBroadcastActivity, ACTIVITY_PING_THROTTLE_MS, parseClientMessage } from './websocket'

describe('shouldBroadcastActivity', () => {
  it('allows the first ping for an unseen session', () => {
    const map = new Map<string, number>()
    expect(shouldBroadcastActivity(map, 'sess-1', 1000)).toBe(true)
  })

  it('suppresses a second ping within the throttle window', () => {
    const map = new Map<string, number>([['sess-1', 1000]])
    expect(shouldBroadcastActivity(map, 'sess-1', 1000 + 1)).toBe(false)
    expect(shouldBroadcastActivity(map, 'sess-1', 1000 + ACTIVITY_PING_THROTTLE_MS / 2)).toBe(false)
    expect(shouldBroadcastActivity(map, 'sess-1', 1000 + ACTIVITY_PING_THROTTLE_MS - 1)).toBe(false)
  })

  it('allows a ping exactly at the threshold boundary', () => {
    const map = new Map<string, number>([['sess-1', 1000]])
    expect(shouldBroadcastActivity(map, 'sess-1', 1000 + ACTIVITY_PING_THROTTLE_MS)).toBe(true)
  })

  it('tracks each session independently', () => {
    const map = new Map<string, number>([['sess-1', 5000]])
    expect(shouldBroadcastActivity(map, 'sess-1', 5001)).toBe(false)
    expect(shouldBroadcastActivity(map, 'sess-2', 5001)).toBe(true)
  })

  it('honors a custom threshold', () => {
    const map = new Map<string, number>([['sess-1', 1000]])
    expect(shouldBroadcastActivity(map, 'sess-1', 2000, 1000)).toBe(true)
    expect(shouldBroadcastActivity(map, 'sess-1', 2000, 10_000)).toBe(false)
  })

  it('treats a missing entry as never-sent', () => {
    const map = new Map<string, number>()
    expect(shouldBroadcastActivity(map, 'sess-1', 0)).toBe(true)
    expect(shouldBroadcastActivity(map, 'sess-1', Number.MAX_SAFE_INTEGER)).toBe(true)
  })
})

describe('parseClientMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses a valid subscribe frame', () => {
    expect(parseClientMessage('{"type":"subscribe","sessionId":"abc"}')).toEqual({
      type: 'subscribe',
      sessionId: 'abc',
    })
  })

  it('returns null and logs on malformed JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseClientMessage('{not-json')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/dropped malformed client message/)
  })

  it('keeps untrusted frame text out of the console format string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseClientMessage('%c%s{not-json')
    expect(warn.mock.calls[0]?.[0]).toBe('[WS] dropped malformed client message: %s (raw: %s)')
    expect(warn.mock.calls[0]?.[2]).toBe('%c%s{not-json')
  })

  it('truncates the raw preview to 120 characters', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseClientMessage('x'.repeat(500))
    const logged = warn.mock.calls[0]?.[0] as string
    const match = logged.match(/raw: (.*)\)$/)
    expect(match).not.toBeNull()
    expect(match![1].length).toBeLessThanOrEqual(120)
  })
})

describe('WebSocket message handling (untrusted frames)', () => {
  let server: Server | undefined

  afterEach(() => {
    server?.close()
    vi.restoreAllMocks()
  })

  it('ignores malformed frames and a non-string sessionId without crashing', async () => {
    vi.resetModules()
    // debug log level exercises the sessionId.slice() logging path.
    // shutdownDelayMs: 0 keeps consumer-tracker from arming process.exit.
    vi.doMock('./config', () => ({
      config: { logLevel: 'debug', shutdownDelayMs: 0, corsAllowedOrigins: [] },
    }))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { attachWebSocket, broadcastToSession } = await import('./websocket')
    const srv = createServer()
    server = srv
    attachWebSocket(srv)
    await new Promise<void>((res) => srv.listen(0, '127.0.0.1', res))
    const { port } = srv.address() as AddressInfo

    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/events/stream`)
    await new Promise<void>((res, rej) => {
      ws.on('open', () => res())
      ws.on('error', rej)
    })
    ws.send('{not-json')
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: 123 }))
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'sess-ok' }))

    // The valid subscribe after the bad frames must still take effect.
    // Frames are processed asynchronously, so poll the broadcast until
    // the subscription lands.
    const received = new Promise<string>((res) => ws.on('message', (d) => res(d.toString())))
    const poll = setInterval(() => broadcastToSession('sess-ok', { type: 'ping' }), 10)
    try {
      expect(JSON.parse(await received)).toEqual({ type: 'ping' })
    } finally {
      clearInterval(poll)
      ws.close()
    }
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/dropped malformed client message/),
      expect.anything(),
      expect.anything(),
    )
  })
})
