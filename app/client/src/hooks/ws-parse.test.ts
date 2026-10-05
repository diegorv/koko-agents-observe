import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseWsMessage } from './ws-parse'

describe('parseWsMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses a valid event frame', () => {
    const raw = JSON.stringify({ type: 'event', data: { id: 1 } })
    expect(parseWsMessage(raw)).toEqual({ type: 'event', data: { id: 1 } })
  })

  it('returns null and logs on malformed JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseWsMessage('{not-json')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/dropped malformed message/)
  })

  it('returns null and logs on non-string payload', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseWsMessage(new Blob())).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/dropped non-string message/))
  })

  it('truncates raw preview to 120 chars on parse failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseWsMessage('x'.repeat(500))
    const raw = warn.mock.calls[0]?.[2] as string
    expect(raw.length).toBeLessThanOrEqual(120)
  })

  it('keeps untrusted frame text out of the console format string', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseWsMessage('%c%s{not-json')
    expect(warn.mock.calls[0]?.[0]).toBe('[WS] dropped malformed message: %s (raw: %s)')
    expect(warn.mock.calls[0]?.[2]).toBe('%c%s{not-json')
  })
})
