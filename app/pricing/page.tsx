import type { Metadata } from 'next'
import { PLANS, DEFAULT_OVERAGE_CAP_USD, type Plan } from '@/lib/pricing/plans'
import { SiteFooter } from '@/components/site/SiteFooter'
import { BACKTEST, MODEL_VERSION } from '@/lib/site/modelFacts'

// The pricing page renders lib/pricing/plans.ts directly: what the metering
// layer enforces is exactly what this page shows, by construction (Section
// 9: code and content never drift). Laid out as a spec sheet: every plan
// answers the same rows, so they compare line by line.

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'ChainScore API pricing: a free developer tier, metered per-score plans with customer-set overage caps, and monitored-wallet subscriptions with webhooks.',
  alternates: { canonical: '/pricing' },
}

function formatQuota(n: number): string {
  return n === 0 ? 'Custom' : n.toLocaleString('en-US')
}

function overage(plan: Plan): string {
  if (plan.overagePerScoreUsd === null) return plan.id === 'enterprise' ? 'Custom' : 'None (hard stop)'
  return `$${plan.overagePerScoreUsd}`
}

const ROWS: Array<{ label: string; value: (p: Plan) => string }> = [
  { label: 'Scores / month', value: (p) => formatQuota(p.scoresPerMonth) },
  { label: 'Monitored wallets', value: (p) => formatQuota(p.monitoredWallets) },
  { label: 'Overage / score', value: overage },
  { label: 'Rate limit', value: (p) => `${p.rateLimitPerMin}/min` },
  { label: 'Webhooks', value: (p) => (p.webhooks ? 'Yes' : 'No') },
  { label: 'Support', value: (p) => p.support },
  { label: 'Attribution', value: (p) => (p.attributionRequired ? 'Required' : 'Not required') },
]

export default function PricingPage() {
  const plans = [PLANS.free, PLANS.starter, PLANS.growth, PLANS.enterprise]
  return (
    <>
      <main className="relative">
        <section className="frame pb-[8svh] pt-10 sm:pt-14" aria-labelledby="pricing-heading">
          <div className="grid grid-cols-12 gap-x-[var(--gutter)] border-t border-text/80 pt-3">
            <p className="t-label col-span-6 text-text sm:col-span-4">(P) Pricing</p>
            <p className="t-label col-span-6 text-right text-muted sm:col-span-8">
              Two meters · overage capped by you
            </p>
          </div>
          <h1 id="pricing-heading" className="t-display mt-12 text-[clamp(3.6rem,9.5vw,11rem)] text-text">
            <span className="cs-rise-lcp block">Pricing that</span>
            <span className="cs-rise-lcp block" style={{ ['--d' as string]: '90ms' }}>
              cannot surprise you<span className="text-accent">.</span>
            </span>
          </h1>
          <p className="t-body mt-10 max-w-[56ch] text-muted">
            Two meters: per-score lookups and monitored wallets with webhooks. Overage only ever
            accrues up to a cap you set yourself (default ${DEFAULT_OVERAGE_CAP_USD}/month); past it,
            requests pause instead of billing. Every response carries your live usage in its headers.
          </p>
        </section>

        <section className="frame pb-[10svh]" aria-label="Plans">
          <div className="grid border-t border-text/80 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan, i) => {
              const featured = plan.id === 'starter'
              return (
                <article
                  key={plan.id}
                  data-reveal
                  style={{ ['--d' as string]: `${i * 70}ms` }}
                  className={`relative flex flex-col border-b border-text/20 py-8 xl:border-b-0 ${
                    // One padding rule per column, so no two utilities fight.
                    i === 0
                      ? 'md:pr-6'
                      : i === 1
                        ? 'md:pl-6 xl:pr-6'
                        : i === 2
                          ? 'md:pr-6 xl:pl-6'
                          : 'md:pl-6'
                  } ${i < plans.length - 1 ? 'xl:border-r xl:border-text/20' : ''}`}
                >
                  {featured && <span className="absolute inset-x-0 top-0 h-[3px] bg-accent md:left-6 md:right-6" aria-hidden />}
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="t-headline text-[2rem] text-text">{plan.name}</h2>
                    <span className="t-label text-muted">0{i + 1}</span>
                  </div>
                  <p className="t-body mt-3 min-h-[3.25rem] text-[0.95rem] text-muted">{plan.headline}</p>
                  <p className="t-display tnum mt-6 text-[4.25rem] text-text">
                    {plan.priceUsdMonthly === null ? (
                      'Custom'
                    ) : plan.priceUsdMonthly === 0 ? (
                      'Free'
                    ) : (
                      <>
                        ${plan.priceUsdMonthly}
                        <span className="t-label ml-2 align-middle text-muted">/ month</span>
                      </>
                    )}
                  </p>
                  <dl className="mt-7">
                    {ROWS.map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between gap-4 border-t border-text/15 py-2.5">
                        <dt className="t-label text-muted">{row.label}</dt>
                        <dd className="t-label text-right text-text">{row.value(plan)}</dd>
                      </div>
                    ))}
                  </dl>
                  <a
                    href={
                      plan.id === 'enterprise'
                        ? 'mailto:api@chainscore.dev?subject=Enterprise%20pricing'
                        : 'mailto:api@chainscore.dev?subject=API%20key%20request%20(' + plan.id + ')'
                    }
                    className={`btn mt-8 ${featured ? 'btn-signal' : 'btn-line'}`}
                  >
                    <span>{plan.id === 'enterprise' ? 'Talk to us' : 'Request a key'}</span>
                    <span className="btn-arrow" aria-hidden>
                      →
                    </span>
                  </a>
                </article>
              )
            })}
          </div>

          <p className="t-body mt-10 max-w-[70ch] text-[0.95rem] text-muted">
            Billing integration is in progress; keys are provisioned manually today and metering is
            already live, so your usage and quota are visible in the response headers from day one.
            Sandbox testing against the free tier is unlimited for invalid-address and error-path
            calls, which are never counted.
          </p>
        </section>
      </main>
      <SiteFooter
        modelVersion={MODEL_VERSION}
        backtestDate={new Date(BACKTEST.generatedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        })}
      />
    </>
  )
}
