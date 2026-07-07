// Shared unit-economics constants (Section 9 / docs/PRICING.md). The
// Strategy agent reads these instead of inventing numbers; when reality
// diverges (provider price changes, telemetry), update HERE and the doc
// together. Estimates carry their assumptions.

export const UNIT_ECONOMICS = {
  // Blended cost per scored API call, assuming ~50% cache hit rate.
  blendedCostPerScoreUsd: 0.0005,
  // Cold-path cost per score (all providers + compute, no cache).
  coldCostPerScoreUsd: 0.001,
  // Monitored wallet: one re-score per day, mostly cached after the first.
  monitoredWalletMonthlyCostUsd: 0.03,
  assumptions:
    'Provider list prices as of 2026-07: The Graph gateway ~$0.00012/score (3 queries), Alchemy ~$0.0002, Etherscan free tier (paid $199/mo tier needed at Growth volume), Vercel compute ~$0.0003 at ~1.5s p50, Upstash ~$0.00001. 50% cache hit assumed for blended.',
  asOf: '2026-07-06',
} as const

export interface TierEconomics {
  planId: string
  priceUsdMonthly: number | null
  revenuePerScoreUsd: number | null
  grossMarginPct: number | null
}

import { PLANS } from './plans'

export function tierEconomics(): TierEconomics[] {
  return Object.values(PLANS).map((plan) => {
    if (plan.priceUsdMonthly === null || plan.scoresPerMonth === 0) {
      return {
        planId: plan.id,
        priceUsdMonthly: plan.priceUsdMonthly,
        revenuePerScoreUsd: null,
        grossMarginPct: null,
      }
    }
    const revenuePerScore = plan.priceUsdMonthly / plan.scoresPerMonth
    const margin =
      plan.priceUsdMonthly === 0
        ? null
        : (revenuePerScore - UNIT_ECONOMICS.blendedCostPerScoreUsd) / revenuePerScore
    return {
      planId: plan.id,
      priceUsdMonthly: plan.priceUsdMonthly,
      revenuePerScoreUsd: revenuePerScore,
      grossMarginPct: margin === null ? null : Math.round(margin * 1000) / 10,
    }
  })
}
