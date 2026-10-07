import type { Agent } from '@/types'

/**
 * A session/agent with no activity for this long is shown as Ended even
 * without a stop signal. Covers crashed/killed processes (and agent classes
 * like Codex) that never emit SessionEnd / SubagentStop.
 */
export const RUNNING_IDLE_CUTOFF_MS = 45 * 60 * 1000

interface SessionLike {
  stoppedAt: number | null
  lastActivity?: number | null
  startedAt: number
}

/**
 * Reads only `stoppedAt` (never the server's `status` string, which goes
 * stale after the WS handler clears `stoppedAt` in the client cache).
 */
export function isSessionRunning(session: SessionLike, now: number): boolean {
  if (session.stoppedAt) return false
  return now - (session.lastActivity || session.startedAt) < RUNNING_IDLE_CUTOFF_MS
}

/**
 * `sessionEnded` covers subagents that never got their own stop event
 * (common: a large ended session can have dozens of them) — once the
 * session is over, none of its agents can still be running.
 */
export function isAgentRunning(agent: Agent, now: number, sessionEnded = false): boolean {
  if (sessionEnded || agent.status !== 'active') return false
  return now - (agent.lastEventAt ?? 0) < RUNNING_IDLE_CUTOFF_MS
}

/** Stable split that keeps the caller's order and object identity. */
export function partitionByRunning<T>(
  items: T[],
  isRunning: (item: T) => boolean,
): { running: T[]; ended: T[] } {
  const running: T[] = []
  const ended: T[] = []
  for (const item of items) (isRunning(item) ? running : ended).push(item)
  return { running, ended }
}

// Only rewrite lastActivity when it lags by more than this, so activity
// pings don't hand React Query a new array on every single event.
const LAST_ACTIVITY_PATCH_SLACK_MS = 60_000

/**
 * Cache patch for an activity ping: the session is alive, so clear
 * stoppedAt and refresh lastActivity (otherwise a session past the idle
 * cutoff would stay Ended while running). Returns `rows` unchanged when
 * nothing needs patching.
 */
export function markSessionRowActive<
  T extends { id: string; stoppedAt: number | null; lastActivity: number | null },
>(rows: T[], sessionId: string, now: number): T[] {
  let changed = false
  const next = rows.map((s) => {
    if (s.id !== sessionId) return s
    const stale = now - (s.lastActivity ?? 0) > LAST_ACTIVITY_PATCH_SLACK_MS
    if (s.stoppedAt == null && !stale) return s
    changed = true
    return { ...s, stoppedAt: null, lastActivity: stale ? now : s.lastActivity }
  })
  return changed ? next : rows
}
