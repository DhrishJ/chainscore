import { describe, expect, it } from 'vitest'
import { computeScore } from '@/lib/data/mlScorer'
import type { RawWalletData } from '@/types'

function borrower(over: Partial<RawWalletData> = {}): RawWalletData {
  const twoYearsAgo = Math.floor(Date.now() / 1000) - 730 * 86400
  return {
    firstTxTimestamp: twoYearsAgo,
    txCount: 420, txCount30d: 12, txCount90d: 40, txCount180d: 90,
    activeDaysCount: 180, activeMonthsLast12: 9, daysSinceFirstDefi: 500,
    totalPortfolioUSD: 15000, stablecoinPct: 25, tokenDiversity: 8,
    hasETH: true, hasENS: true, isGnosisSafe: false, hasAave: true, hasCompound: false,
    aaveBorrows: 6, aaveRepays: 6, aaveLiquidations: 0,
    compoundBorrows: 0, compoundRepays: 0, compoundLiquidations: 0,
    hasUniswapLP: true, hasStakedETH: true, hasGovernanceVote: false,
    protocolsUsed: ['Aave', 'Uniswap', 'Lido'], ens: 'tester.eth', errors: {},
    ...over,
  }
}

describe('topContributions explainability', () => {
  it('exposes signed, human-labeled contributions for a scored borrower', () => {
    const result = computeScore(borrower())
    expect(result.topContributions).toBeDefined()
    const contribs = result.topContributions!
    expect(contribs.length).toBeGreaterThan(0)
    for (const c of contribs) {
      expect(typeof c.label).toBe('string')
      expect(c.label.length).toBeGreaterThan(0)
      expect(Number.isFinite(c.impact)).toBe(true)
      // Labels are human-readable, not raw feature keys with underscores.
      expect(c.label).not.toMatch(/_/)
    }
  })

  it('orders positive impacts before negative impacts', () => {
    const contribs = computeScore(borrower()).topContributions ?? []
    const firstNegIndex = contribs.findIndex((c) => c.impact < 0)
    if (firstNegIndex >= 0) {
      // Everything before the first negative must be positive.
      for (let i = 0; i < firstNegIndex; i++) expect(contribs[i].impact).toBeGreaterThan(0)
    }
  })

  it('omits contributions for a no-borrow-history wallet', () => {
    const result = computeScore(borrower({ aaveBorrows: 0, aaveRepays: 0 }))
    expect(result.noBorrowHistory).toBe(true)
    expect(result.topContributions).toBeUndefined()
  })
})
