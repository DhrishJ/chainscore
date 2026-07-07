import { describe, expect, it } from 'vitest'
import { registeredAgents } from '@/lib/agents/orchestrator'
import { UNIT_ECONOMICS, tierEconomics } from '@/lib/pricing/economics'
import '@/lib/agents/strategy'

describe('strategy agent registration', () => {
  it('registers itself with the orchestrator on import', () => {
    expect(registeredAgents()).toContain('strategy')
  })
})

describe('unit economics module', () => {
  it('cost constants are positive and dated', () => {
    expect(UNIT_ECONOMICS.blendedCostPerScoreUsd).toBeGreaterThan(0)
    expect(UNIT_ECONOMICS.coldCostPerScoreUsd).toBeGreaterThanOrEqual(
      UNIT_ECONOMICS.blendedCostPerScoreUsd
    )
    expect(UNIT_ECONOMICS.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('paid tiers carry healthy gross margins; free and enterprise are null', () => {
    const rows = tierEconomics()
    const byId = Object.fromEntries(rows.map((r) => [r.planId, r]))
    expect(byId.starter.grossMarginPct).toBeGreaterThan(85)
    expect(byId.growth.grossMarginPct).toBeGreaterThan(85)
    expect(byId.free.grossMarginPct).toBeNull()
    expect(byId.enterprise.grossMarginPct).toBeNull()
  })
})
