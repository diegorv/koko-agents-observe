import { describe, it, expect } from 'vitest'
import { isBackgroundTick, backgroundAgentId, BACKGROUND_LANE_SUFFIX } from './background-tick'
import type { EventEnvelope } from '../types'

function envelope(over: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    agentClass: 'claude-code',
    sessionId: 'sess-1',
    agentId: 'a78c1c00295704f96',
    hookName: 'SubagentStop',
    payload: { hook_event_name: 'SubagentStop', agent_type: '' },
    ...over,
  }
}

describe('backgroundAgentId', () => {
  it('derives one stable lane id per session', () => {
    expect(backgroundAgentId('sess-1')).toBe(`sess-1${BACKGROUND_LANE_SUFFIX}`)
    expect(backgroundAgentId('sess-1')).toBe(backgroundAgentId('sess-1'))
    expect(backgroundAgentId('sess-2')).not.toBe(backgroundAgentId('sess-1'))
  })
})

describe('isBackgroundTick', () => {
  it('flags a SubagentStop with an empty agent_type', () => {
    expect(isBackgroundTick(envelope(), null)).toBe(true)
  })

  it('flags a SubagentStop with agent_type missing entirely', () => {
    expect(isBackgroundTick(envelope({ payload: { hook_event_name: 'SubagentStop' } }), null)).toBe(
      true,
    )
  })

  it('flags a SubagentStop whose agent_type is only whitespace', () => {
    expect(isBackgroundTick(envelope({ payload: { agent_type: '   ' } }), null)).toBe(true)
  })

  it('does not flag a real subagent stop that carries an agent_type', () => {
    expect(isBackgroundTick(envelope({ payload: { agent_type: 'general-purpose' } }), null)).toBe(
      false,
    )
  })

  it('does not flag any hook other than SubagentStop', () => {
    for (const hookName of ['SubagentStart', 'Stop', 'PostToolUse', 'SessionEnd']) {
      expect(isBackgroundTick(envelope({ hookName }), null)).toBe(false)
    }
  })

  it('does not flag an id that already has an agents row (SubagentStart ran first)', () => {
    const existing = { id: 'a78c1c00295704f96', agent_class: 'claude-code' }
    expect(isBackgroundTick(envelope(), existing)).toBe(false)
  })

  it('tolerates a null or non-object payload', () => {
    expect(isBackgroundTick(envelope({ payload: null as never }), null)).toBe(true)
  })

  it('never re-flags the background lane itself', () => {
    const lane = backgroundAgentId('sess-1')
    expect(isBackgroundTick(envelope({ agentId: lane }), null)).toBe(false)
  })
})
