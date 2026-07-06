import { env } from '@/lib/env.server'

// Single read point for agent-layer configuration (G2, G7). Agents never
// read process.env and never decide their own caps; everything here is
// deployment config a human controls.

export type AgentName = 'strategy' | 'engineering' | 'marketing'

// G7 kill switch: halts every agent at the orchestrator.
export function killSwitchActive(): boolean {
  return env.AGENTS_KILL_SWITCH === 'true'
}

export function agentEnabled(agent: AgentName): boolean {
  if (killSwitchActive()) return false
  switch (agent) {
    case 'strategy':
      return env.AGENT_STRATEGY_ENABLED === 'true'
    case 'engineering':
      return env.AGENT_ENGINEERING_ENABLED === 'true'
    case 'marketing':
      return env.AGENT_MARKETING_ENABLED === 'true'
  }
}

// G2 spend ceilings. These are the code backstop BEHIND the human-approval
// outbox gate: even an approved spend cannot exceed them. Zero means no
// spend can execute at all.
export interface SpendCaps {
  dailyUsd: number
  channelDailyUsd: number
}

export function spendCaps(): SpendCaps {
  return {
    dailyUsd: env.SPEND_CAP_DAILY_USD,
    channelDailyUsd: env.SPEND_CAP_CHANNEL_DAILY_USD,
  }
}
