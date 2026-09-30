import type { EventEnvelope } from '../types'

/**
 * Suffix appended to a session id to form its background lane id.
 * A colon keeps the lane id un-collidable with a real agent id, which
 * Claude Code always emits as a bare hex token.
 */
export const BACKGROUND_LANE_SUFFIX = ':background'

/** Identity stamped on the lane's `agents` row, so the UI can label it. */
export const BACKGROUND_LANE_NAME = 'Background'
export const BACKGROUND_LANE_TYPE = 'background'
export const BACKGROUND_LANE_DESCRIPTION = 'Background task poll ticks'

/** The single lane every background poll tick in a session collapses onto. */
export function backgroundAgentId(sessionId: string): string {
  return `${sessionId}${BACKGROUND_LANE_SUFFIX}`
}

/**
 * Detect a background poll tick masquerading as a subagent.
 *
 * While a session has background work in flight (a Monitor, a
 * backgrounded shell, a loop), Claude Code fires a `SubagentStop` about
 * every 31s so the tick bubbles back to the parent. Each tick carries a
 * freshly minted `agent_id` that belongs to no actual subagent: no
 * `SubagentStart` precedes it, no `subagents/agent-<id>.jsonl` is ever
 * written, the id appears nowhere in the session transcript, and
 * `last_assistant_message` is the *main* thread's message rather than an
 * agent result. Left alone, each tick becomes its own single-event agent
 * row — 95% of the agents in a long-lived install.
 *
 * The tell is `agent_type`: a real subagent stop always names its type
 * (`general-purpose`, `Explore`, `fork`, …); a tick leaves it empty.
 * Measured across every SubagentStop in a 10,870-event corpus the split
 * was total — 10,372 empty-type ticks, 498 typed real stops, no overlap.
 *
 * `existingAgent` is the `agents` row already stored under this id (or
 * null). A row can only exist because `SubagentStart` created it, which
 * makes the id a real subagent regardless of what this payload says —
 * a cheap primary-key guard in case a future agent type ships blank.
 */
export function isBackgroundTick(
  envelope: EventEnvelope,
  existingAgent: { id: string } | null,
): boolean {
  if (envelope.hookName !== 'SubagentStop') return false
  if (existingAgent) return false
  // A lane id reaching here means the tick was already normalized.
  if (envelope.agentId.endsWith(BACKGROUND_LANE_SUFFIX)) return false
  const payload = envelope.payload as Record<string, unknown> | null | undefined
  const agentType = payload?.agent_type
  return typeof agentType !== 'string' || agentType.trim() === ''
}
