import { describe, expect, it } from 'vitest'
import {
  applyIntegrityPenalty,
  assessIntegrity,
  combineSignals,
  detectBurstTiming,
  detectInstantRepay,
  detectSybilFunding,
  detectWashTrading,
} from '@/lib/integrity/detectors'
import {
  burstTimingWallet,
  honestWallet,
  instantRepayWallet,
  sybilCohortWallet,
  washTradingWallet,
} from '../fixtures/syntheticManipulation'

describe('detectors catch their seeded attack', () => {
  it('flags wash trading', () => {
    const s = detectWashTrading(washTradingWallet())
    expect(s.severity).toBeGreaterThan(0.5)
    expect(s.evidence.reciprocalPartners).toBeGreaterThanOrEqual(2)
  })

  it('flags Sybil funding cohorts', () => {
    const s = detectSybilFunding(sybilCohortWallet())
    expect(s.severity).toBeGreaterThan(0.5)
  })

  it('flags burst timing', () => {
    const s = detectBurstTiming(burstTimingWallet())
    expect(s.severity).toBeGreaterThan(0.5)
  })

  it('flags instant repay', () => {
    const s = detectInstantRepay(instantRepayWallet())
    expect(s.severity).toBe(1)
    expect(s.evidence.instant).toBe(6)
  })
})

describe('detectors do not fire on an honest wallet', () => {
  const honest = honestWallet()

  it('wash trading clean', () => {
    expect(detectWashTrading(honest).severity).toBe(0)
  })

  it('sybil clean (no cohort)', () => {
    expect(detectSybilFunding(honest).severity).toBe(0)
  })

  it('burst timing clean (spread activity)', () => {
    expect(detectBurstTiming(honest).severity).toBeLessThan(0.2)
  })

  it('instant repay clean (loans carried for months)', () => {
    expect(detectInstantRepay(honest).severity).toBe(0)
  })

  it('overall assessment is not flagged', () => {
    const assessment = assessIntegrity(honest)
    expect(assessment.flagged).toBe(false)
    expect(assessment.penalty).toBeLessThan(0.2)
  })
})

describe('combineSignals and penalty', () => {
  it('is a bounded soft-OR that never exceeds 1', () => {
    const maxed = combineSignals([
      { id: 'instant_repay', severity: 1, reason: '', evidence: {} },
      { id: 'wash_trading', severity: 1, reason: '', evidence: {} },
      { id: 'sybil_funding', severity: 1, reason: '', evidence: {} },
      { id: 'burst_timing', severity: 1, reason: '', evidence: {} },
    ])
    expect(maxed.penalty).toBeLessThanOrEqual(1)
    expect(maxed.penalty).toBeGreaterThan(0.9)
    expect(maxed.flagged).toBe(true)
  })

  it('a clean set yields zero penalty', () => {
    const clean = combineSignals([{ id: 'wash_trading', severity: 0, reason: '', evidence: {} }])
    expect(clean.penalty).toBe(0)
  })

  it('applies a bounded score reduction that never breaches the floor', () => {
    const maxed = combineSignals([{ id: 'instant_repay', severity: 1, reason: '', evidence: {} }])
    expect(applyIntegrityPenalty(800, maxed)).toBeLessThan(800)
    expect(applyIntegrityPenalty(310, maxed, 300, 250)).toBe(300)
  })

  it('leaves an honest score untouched', () => {
    const clean = assessIntegrity(honestWallet())
    expect(applyIntegrityPenalty(720, clean)).toBe(720 - Math.round(clean.penalty * 250))
    expect(clean.penalty).toBeLessThan(0.2)
  })

  it('an instant-repay wallet is materially penalized', () => {
    const assessment = assessIntegrity(instantRepayWallet())
    expect(assessment.penalty).toBeGreaterThan(0.9)
    expect(applyIntegrityPenalty(750, assessment)).toBeLessThan(550)
  })
})
