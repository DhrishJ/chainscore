import type { Metadata } from 'next'
import { PLANS, DEFAULT_OVERAGE_CAP_USD } from '@/lib/pricing/plans'

// The pricing page renders lib/pricing/plans.ts directly: what the metering
// layer enforces is exactly what this page shows, by construction (Section
// 9: code and content never drift).

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'ChainScore API pricing: a free developer tier, metered per-score plans with customer-set overage caps, and monitored-wallet subscriptions with webhooks.',
  alternates: { canonical: '/pricing' },
}

function formatQuota(n: number): string {
  return n === 0 ? 'Custom' : n.toLocaleString('en-US')
}

export default function PricingPage() {
  const plans = [PLANS.free, PLANS.starter, PLANS.growth, PLANS.enterprise]
  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="max-w-2xl">
        <h1 className="font-grotesk text-4xl font-bold tracking-[-0.02em] text-text">
          Pricing that cannot surprise you
        </h1>
        <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
          Two meters: per-score lookups and monitored wallets with webhooks. Overage only ever
          accrues up to a cap you set yourself (default ${DEFAULT_OVERAGE_CAP_USD}/month); past it,
          requests pause instead of billing. Every response carries your live usage in its headers.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-2xl border p-7 ${
              plan.id === 'starter' ? 'border-accent/50 bg-card' : 'border-border bg-card'
            }`}
          >
            <h2 className="font-grotesk text-xl font-bold text-text">{plan.name}</h2>
            <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-muted">{plan.headline}</p>
            <p className="mt-5 font-grotesk text-4xl font-bold text-text">
              {plan.priceUsdMonthly === null ? (
                'Custom'
              ) : plan.priceUsdMonthly === 0 ? (
                'Free'
              ) : (
                <>
                  ${plan.priceUsdMonthly}
                  <span className="text-base font-medium text-muted">/mo</span>
                </>
              )}
            </p>
            <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Scores / month</dt>
                <dd className="font-mono text-text">{formatQuota(plan.scoresPerMonth)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Monitored wallets</dt>
                <dd className="font-mono text-text">{formatQuota(plan.monitoredWallets)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Overage / score</dt>
                <dd className="font-mono text-text">
                  {plan.overagePerScoreUsd === null
                    ? plan.id === 'enterprise'
                      ? 'Custom'
                      : 'None (hard stop)'
                    : `$${plan.overagePerScoreUsd}`}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Rate limit</dt>
                <dd className="font-mono text-text">{plan.rateLimitPerMin}/min</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Webhooks</dt>
                <dd className="text-text">{plan.webhooks ? 'Yes' : 'No'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Support</dt>
                <dd className="text-text">{plan.support}</dd>
              </div>
              {plan.attributionRequired && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Attribution</dt>
                  <dd className="text-text">Required</dd>
                </div>
              )}
            </dl>
            <a
              href={
                plan.id === 'enterprise'
                  ? 'mailto:api@chainscore.dev?subject=Enterprise%20pricing'
                  : 'mailto:api@chainscore.dev?subject=API%20key%20request%20(' + plan.id + ')'
              }
              className={`mt-7 rounded-xl px-5 py-3 text-center font-grotesk text-sm font-semibold transition-all active:translate-y-px ${
                plan.id === 'starter'
                  ? 'bg-accent text-white hover:bg-accent/90'
                  : 'border border-border text-text hover:border-accent/40'
              }`}
            >
              {plan.id === 'enterprise' ? 'Talk to us' : 'Request a key'}
            </a>
          </div>
        ))}
      </div>

      <p className="mt-10 max-w-3xl text-pretty text-sm leading-relaxed text-muted">
        Billing integration is in progress; keys are provisioned manually today and metering is
        already live, so your usage and quota are visible in the response headers from day one.
        Sandbox testing against the free tier is unlimited for invalid-address and error-path
        calls, which are never counted.
      </p>
    </main>
  )
}
