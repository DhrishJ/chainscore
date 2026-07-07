// The single source of truth for pricing (Section 9). The pricing page,
// the metering layer, and the (future) Stripe integration all read THIS
// module, so code and content cannot drift. Numbers here are the starting
// framework grounded in docs/PRICING.md unit economics; the Strategy agent
// and the human tune them, nothing else does.
//
// Two meters, two real buyer needs:
//  - scores: point-in-time lookups, metered per call per month
//  - monitoredWallets: continuous scoring + webhooks, per wallet per month
//    (the recurring-revenue SKU; fits the webhook architecture)

export type PlanId = 'free' | 'starter' | 'growth' | 'enterprise'

export interface Plan {
  id: PlanId
  name: string
  priceUsdMonthly: number | null // null = custom / negotiated
  scoresPerMonth: number // included quota
  monitoredWallets: number // included quota
  overagePerScoreUsd: number | null // null = no overage (hard stop or custom)
  overagePerWalletUsd: number | null
  rateLimitPerMin: number
  webhooks: boolean
  support: string
  attributionRequired: boolean
  headline: string
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Developer',
    priceUsdMonthly: 0,
    scoresPerMonth: 1_000,
    monitoredWallets: 0,
    overagePerScoreUsd: null, // hard stop at quota: nobody bills a free tier
    overagePerWalletUsd: null,
    rateLimitPerMin: 30,
    webhooks: false,
    support: 'Community',
    attributionRequired: true,
    headline: 'Build and evaluate. 1,000 production scores a month, free.',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceUsdMonthly: 99,
    scoresPerMonth: 10_000,
    monitoredWallets: 250,
    overagePerScoreUsd: 0.012,
    overagePerWalletUsd: 0.15,
    rateLimitPerMin: 120,
    webhooks: true,
    support: 'Email',
    attributionRequired: false,
    headline: 'For a first integration: webhooks, 10K scores, 250 monitored wallets.',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceUsdMonthly: 499,
    scoresPerMonth: 75_000,
    monitoredWallets: 2_000,
    overagePerScoreUsd: 0.008,
    overagePerWalletUsd: 0.1,
    rateLimitPerMin: 300,
    webhooks: true,
    support: 'Priority email',
    attributionRequired: false,
    headline: 'Production underwriting volume with priority support and higher limits.',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceUsdMonthly: null,
    scoresPerMonth: 0, // negotiated
    monitoredWallets: 0, // negotiated
    overagePerScoreUsd: null,
    overagePerWalletUsd: null,
    rateLimitPerMin: 1_000,
    webhooks: true,
    support: 'Dedicated, SLA',
    attributionRequired: false,
    headline: 'Volume pricing, SLA, custom integration, optional onchain feed.',
  },
}

export const DEFAULT_PLAN: PlanId = 'free'

// Customer-set hard cap on overage spend (USD/month). Enforced in metering:
// once estimated overage reaches the cap, requests get 429 QUOTA_EXCEEDED
// instead of accruing charges. Learned from competitor complaints about
// runaway bills; default is conservative.
export const DEFAULT_OVERAGE_CAP_USD = 50

export function planFor(id: string | null | undefined): Plan {
  if (id && id in PLANS) return PLANS[id as PlanId]
  return PLANS[DEFAULT_PLAN]
}

// Estimated overage charge for a usage count beyond quota, for cap checks.
export function estimateOverageUsd(plan: Plan, scoresUsed: number): number {
  if (plan.overagePerScoreUsd === null || scoresUsed <= plan.scoresPerMonth) return 0
  return (scoresUsed - plan.scoresPerMonth) * plan.overagePerScoreUsd
}
