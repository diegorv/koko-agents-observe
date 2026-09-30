import type { Agent } from '@/types'

/**
 * Suffix the server appends to a session id to form its background lane —
 * the single row every background poll tick collapses onto. Mirrors
 * BACKGROUND_LANE_SUFFIX in app/server/src/services/background-tick.ts.
 */
export const BACKGROUND_LANE_SUFFIX = ':background'
const BACKGROUND_LANE_LABEL = 'Background'

/** True for the synthetic per-session background lane. */
export function isBackgroundLane(agentId: string): boolean {
  return agentId.endsWith(BACKGROUND_LANE_SUFFIX)
}

// Display name for an agent: name (short) → description → truncated ID
export function getAgentDisplayName(agent: Agent): string {
  // Checked before the root-agent rule: the lane has no parentAgentId, so
  // it would otherwise be labelled "Main".
  if (isBackgroundLane(agent.id)) return agent.name || BACKGROUND_LANE_LABEL
  if (!agent.parentAgentId) return 'Main'
  return agent.name || agent.description || agent.id.slice(0, 8)
}

/**
 * Order agents into timeline rows: Main first, then the background lane,
 * then real subagents newest-first.
 *
 * The lane carries no parentAgentId (nothing spawned it), so without the
 * explicit pin it would sort in with the root agents and drift above Main.
 * It is flagged `isSubagent` so it renders with the indented lane styling
 * rather than as a second root row.
 */
export function orderAgentLanes(
  agents: Agent[],
  selectedAgentIds: string[],
): { agent: Agent; isSubagent: boolean }[] {
  const mainAgents: { agent: Agent; isSubagent: boolean }[] = []
  const subAgents: { agent: Agent; isSubagent: boolean }[] = []
  let backgroundLane: { agent: Agent; isSubagent: boolean } | null = null

  for (const a of agents) {
    if (selectedAgentIds.length > 0 && !selectedAgentIds.includes(a.id)) continue
    if (isBackgroundLane(a.id)) {
      backgroundLane = { agent: a, isSubagent: true }
    } else if (!a.parentAgentId) {
      mainAgents.push({ agent: a, isSubagent: false })
    } else {
      subAgents.push({ agent: a, isSubagent: true })
    }
  }
  // Reverse non-main agents so newest appear right after Main
  subAgents.reverse()
  return [...mainAgents, ...(backgroundLane ? [backgroundLane] : []), ...subAgents]
}

// ── Agent colors ──────────────────────────────────────────────────────
// Ordered list of colors. Agents are assigned colors by their position
// in the flattened agent tree (depth-first), cycling when exhausted.

export interface AgentColorClasses {
  /** Text + border classes for event-row left border and agent label */
  text: string
  /** Just the text color classes (light + dark) */
  textOnly: string
  /** Border classes only */
  border: string
  /** Background color for dots / indicators */
  dot: string
}

const AGENT_COLORS: AgentColorClasses[] = [
  {
    text: 'text-green-700 dark:text-green-400 border-green-600/50 dark:border-green-500/50',
    textOnly: 'text-green-700 dark:text-green-400',
    border: 'border-green-600/50 dark:border-green-500/50',
    dot: 'bg-green-600 dark:bg-green-500',
  },
  {
    text: 'text-blue-700 dark:text-blue-400 border-blue-600/50 dark:border-blue-500/50',
    textOnly: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-600/50 dark:border-blue-500/50',
    dot: 'bg-blue-600 dark:bg-blue-500',
  },
  {
    text: 'text-purple-700 dark:text-purple-400 border-purple-600/50 dark:border-purple-500/50',
    textOnly: 'text-purple-700 dark:text-purple-400',
    border: 'border-purple-600/50 dark:border-purple-500/50',
    dot: 'bg-purple-600 dark:bg-purple-500',
  },
  {
    text: 'text-amber-700 dark:text-amber-400 border-amber-600/50 dark:border-amber-500/50',
    textOnly: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-600/50 dark:border-amber-500/50',
    dot: 'bg-amber-600 dark:bg-amber-500',
  },
  {
    text: 'text-cyan-700 dark:text-cyan-400 border-cyan-600/50 dark:border-cyan-500/50',
    textOnly: 'text-cyan-700 dark:text-cyan-400',
    border: 'border-cyan-600/50 dark:border-cyan-500/50',
    dot: 'bg-cyan-600 dark:bg-cyan-500',
  },
  {
    text: 'text-rose-700 dark:text-rose-400 border-rose-600/50 dark:border-rose-500/50',
    textOnly: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-600/50 dark:border-rose-500/50',
    dot: 'bg-rose-600 dark:bg-rose-500',
  },
  {
    text: 'text-emerald-700 dark:text-emerald-400 border-emerald-600/50 dark:border-emerald-500/50',
    textOnly: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-600/50 dark:border-emerald-500/50',
    dot: 'bg-emerald-600 dark:bg-emerald-500',
  },
  {
    text: 'text-orange-700 dark:text-orange-400 border-orange-600/50 dark:border-orange-500/50',
    textOnly: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-600/50 dark:border-orange-500/50',
    dot: 'bg-orange-600 dark:bg-orange-500',
  },
]

/**
 * Build a map from agentId -> color index by flattening the agent tree
 * depth-first. The index is stable as long as the tree order is stable.
 */
export function buildAgentColorMap(agents: Agent[] | undefined): Map<string, number> {
  const map = new Map<string, number>()
  if (!agents) return map
  let idx = 0
  function visit(parentId: string | null) {
    for (const a of agents!) {
      if (a.parentAgentId === parentId) {
        map.set(a.id, idx++)
        visit(a.id)
      }
    }
  }
  visit(null)
  return map
}

/** Get color classes for an agent given its index in the flattened tree. */
export function getAgentColor(index: number): AgentColorClasses {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

/** Convenience: get color classes for an agent by ID, given a color map. */
export function getAgentColorById(
  agentId: string,
  colorMap: Map<string, number>,
): AgentColorClasses {
  const idx = colorMap.get(agentId) ?? 0
  return getAgentColor(idx)
}
