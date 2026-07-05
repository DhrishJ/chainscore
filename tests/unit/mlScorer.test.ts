import { describe, expect, it } from 'vitest'
import { computeScore } from '@/lib/data/mlScorer'
import type { RawWalletData } from '@/types'

// A plausible established borrower. Individual tests override single fields so
// each assertion isolates one behavior.
function wallet(overrides: Partial<RawWalletData> = {}): RawWalletData {
  const twoYearsAgo = Math.floor(Date.now() / 1000) - 730 * 86400
  return {
    firstTxTimestamp: twoYearsAgo,
    txCount: 420,
    txCount30d: 12,
    txCount90d: 40,
    txCount180d: 90,
    activeDaysCount: 180,
    activeMonthsLast12: 9,
    daysSinceFirstDefi: 500,
    totalPortfolioUSD: 15_000,
    stablecoinPct: 25,
    tokenDiversity: 8,
    hasETH: true,
    hasENS: true,
    isGnosisSafe: false,
    hasAave: true,
    hasCompound: false,
    aaveBorrows: 6,
    aaveRepays: 6,
    aaveLiquidations: 0,
    compoundBorrows: 0,
    compoundRepays: 0,
    compoundLiquidations: 0,
    hasUniswapLP: true,
    hasStakedETH: true,
    hasGovernanceVote: false,
    protocolsUsed: ['Aave', 'Uniswap', 'Lido'],
    ens: 'tester.eth',
    errors: {},
    ...overrides,
  }
}

describe('computeScore gates', () => {
  it('returns the new-wallet state for a wallet with no history', () => {
    const result = computeScore(wallet({ txCount: 0, firstTxTimestamp: null }))
    expect(result.newWallet).toBe(true)
    expect(result.score).toBe(300)
    expect(result.grade).toBe('F')
    expect(result.factors).toEqual([])
  })

  it('returns the no-borrow-history state instead of a fabricated score', () => {
    const result = computeScore(
      wallet({ aaveBorrows: 0, aaveRepays: 0, compoundBorrows: 0, compoundRepays: 0 })
    )
    expect(result.noBorrowHistory).toBe(true)
    expect(result.score).toBe(0)
  })
})

describe('computeScore model output', () => {
  it('produces a bounded, graded, versioned score for a borrower', () => {
    const result = computeScore(wallet())
    expect(result.score).toBeGreaterThanOrEqual(300)
    expect(result.score).toBeLessThanOrEqual(850)
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade)
    expect(result.modelVersion).toBeTruthy()
    expect(result.calibratedPD).toBeGreaterThan(0)
    expect(result.calibratedPD).toBeLessThan(1)
    expect(result.factors).toHaveLength(4)
    for (const factor of result.factors) {
      expect(factor.rawScore).toBeGreaterThanOrEqual(0)
      expect(factor.rawScore).toBeLessThanOrEqual(100)
    }
  })

  it('is deterministic for identical inputs', () => {
    const input = wallet()
    const a = computeScore({ ...input })
    const b = computeScore({ ...input })
    expect(a.score).toBe(b.score)
    expect(a.grade).toBe(b.grade)
    expect(a.calibratedPD).toBe(b.calibratedPD)
    expect(a.factors.map((f) => f.rawScore)).toEqual(b.factors.map((f) => f.rawScore))
  })

  it('never scores a liquidated wallet above the same wallet without liquidations', () => {
    // The model is trained with a monotonic constraint on prior liquidations.
    const clean = computeScore(wallet())
    const liquidated = computeScore(wallet({ aaveLiquidations: 5 }))
    expect(liquidated.score).toBeLessThanOrEqual(clean.score)
  })

  it('never scores full repayment below the same wallet with unpaid loans', () => {
    // Monotonic constraint: more repays can only lower predicted risk.
    const unpaid = computeScore(wallet({ aaveRepays: 1 }))
    const repaid = computeScore(wallet({ aaveRepays: 6 }))
    expect(repaid.score).toBeGreaterThanOrEqual(unpaid.score)
  })
})
