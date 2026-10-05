import { describe, test, expect, vi, afterEach } from 'vitest'
import { safeParseJson } from './safe-parse-json'

describe('safeParseJson', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('returns null for null, undefined and empty string', () => {
    expect(safeParseJson(null, 'x')).toBeNull()
    expect(safeParseJson(undefined, 'x')).toBeNull()
    expect(safeParseJson('', 'x')).toBeNull()
  })

  test('returns null for non-string input', () => {
    expect(safeParseJson(123, 'x')).toBeNull()
    expect(safeParseJson({ already: 'object' }, 'x')).toBeNull()
  })

  test('parses valid JSON', () => {
    expect(safeParseJson('{"a":1}', 'x')).toEqual({ a: 1 })
    expect(safeParseJson('[1,2,3]', 'x')).toEqual([1, 2, 3])
  })

  test('returns null and warns with context on corrupt JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeParseJson('{not-json', 'event 42 payload')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/corrupt event 42 payload JSON dropped/)
  })
})
