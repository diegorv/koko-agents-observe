import type { Agent } from '@/types'

/**
 * A session/agent with no activity for this long is shown as Ended even
 * without a stop signal. Covers crashed/killed processes (and agent classes
 * like Codex) that never emit SessionEnd / SubagentStop.
 */
export const RUNNING_IDLE_CUTOFF_MS = 60 * 60 * 1000

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

export function isAgentRunning(agent: Agent, now: number): boolean {
  if (agent.status !== 'active') return false
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
