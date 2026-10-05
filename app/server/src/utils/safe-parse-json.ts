// app/server/src/utils/safe-parse-json.ts

/**
 * Parse a JSON column without throwing. A single corrupt row used to
 * reject a whole list endpoint with a 500; now it returns null and logs
 * the context (e.g. row id) so the bad row is traceable.
 * Empty/missing/non-string input returns null without logging.
 */
export function safeParseJson(raw: unknown, context: string): unknown {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`[server] corrupt ${context} JSON dropped: ${reason}`)
    return null
  }
}
