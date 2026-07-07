import Link from 'next/link'
import { WalletInput } from '@/components/WalletInput'
import { RecentScoresTicker } from '@/components/RecentScoresTicker'
import { ScoreGaugePreview } from '@/components/ScoreGaugePreview'
import {
  CHAIN_COVERAGE,
  FACTOR_GROUPS,
  HERO_STATS,
  METHODOLOGY,
} from '@/lib/site/publicFacts'

// One spearhead: B2B risk infrastructure (the score + retrospective +
// partner API). The consumer score check stays as the top-of-funnel hook in
// the hero. Every number renders from lib/site/publicFacts, which is pinned
// to the Facts Registry and the model by tests (G3). The marketplace is
// deliberately absent from this page pending the Phase 6 product decision.

const steps = [
  {
    title: 'Send a wallet',
    body: 'One API call with any address, or paste it here. No connection, no KYC, nothing offchain.',
  },
  {
    title: 'We read its lending history',
    body: 'Every borrow, repayment, and liquidation across Aave V2/V3 and Compound V2, plus wallet history, read from public chain data.',
  },
  {
    title: 'Get a score you can price with',
    body: 'A 300 to 850 score with calibrated default probability, factor breakdown, integrity checks, and a data-completeness figure on every response.',
  },
]

function CoverageBadge({ status }: { status: 'full' | 'degraded' | 'separate' }) {
  // Colored dot carries the status color; the label stays high-contrast
  // text-text so the badge passes WCAG AA in both themes (axe-gated).
  const dot =
    status === 'full' ? 'bg-success' : status === 'degraded' ? 'bg-warning' : 'bg-muted'
  const border =
    status === 'full'
      ? 'border-success/40'
      : status === 'degraded'
        ? 'border-warning/40'
        : 'border-border'
  const label = status === 'full' ? 'Full' : status === 'degraded' ? 'Reduced tx history' : 'Site only'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${border} bg-card px-2.5 py-0.5 text-xs font-medium text-text`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  )
}

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 cs-grid opacity-40" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] cs-glow" aria-hidden />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pt-20 pb-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          {/* Left: copy + input */}
          <div className="cs-rise-lcp text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Risk infrastructure for onchain lending
            </span>

            <h1 className="mt-7 text-balance font-grotesk text-[2.75rem] font-bold leading-[1.03] tracking-[-0.03em] text-text sm:text-6xl">
              Price borrower risk from{' '}
              <span className="text-accent">real onchain history</span>
            </h1>

            <p className="mx-auto mt-6 max-w-[60ch] text-pretty text-lg leading-relaxed text-muted lg:mx-0">
              ChainScore turns a wallet&apos;s borrowing and repayment record into a 300 to 850
              credit score, with calibrated default probability and a published backtest. Built for
              lenders and protocols that underwrite onchain. One API call per decision.
            </p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <a
                href="#api"
                className="rounded-xl bg-accent px-7 py-3.5 font-grotesk text-sm font-semibold text-white transition-all hover:bg-accent/90 active:translate-y-px"
              >
                Get the API
              </a>
              <Link
                href="/retrospective"
                className="rounded-xl border border-border bg-card px-7 py-3.5 font-grotesk text-sm font-semibold text-text transition-all hover:border-accent/40 active:translate-y-px"
              >
                Read the backtest
              </Link>
            </div>

            <div className="mt-10">
              <p className="mb-3 text-sm font-medium text-muted">
                Or check any wallet right now, free:
              </p>
              <WalletInput />
            </div>
          </div>

          {/* Right: product visual */}
          <div className="cs-rise-lcp" style={{ animationDelay: '120ms' }}>
            <ScoreGaugePreview />
          </div>
        </div>
      </section>

      {/* Live activity strip */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-6 py-6 lg:flex-row lg:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
            {CHAIN_COVERAGE.map((c) => (
              <span key={c.slug} className="font-grotesk text-sm font-semibold text-text">
                {c.name}
                {c.status !== 'full' && <span className="text-muted">*</span>}
              </span>
            ))}
            <a href="#coverage" className="text-xs font-medium text-accent hover:underline">
              * coverage detail
            </a>
          </div>
          <RecentScoresTicker />
        </div>
      </section>

      {/* Stats: every number is Facts-Registry-backed */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <dl className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:divide-x sm:divide-border">
          {HERO_STATS.map((s) => (
            <div key={s.label} className="sm:px-8 sm:first:pl-0">
              <dt className="font-grotesk text-3xl font-bold text-text sm:text-4xl">
                {s.href ? (
                  <a href={s.href} className="transition-colors hover:text-accent">
                    {s.value}
                  </a>
                ) : (
                  s.value
                )}
              </dt>
              <dd className="mt-1.5 text-sm font-medium text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Coverage, honestly stated */}
      <section id="coverage" className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <h2 className="max-w-[16ch] text-balance font-grotesk text-3xl font-bold leading-tight tracking-[-0.02em] text-text sm:text-[2.5rem]">
                Coverage we will state precisely
              </h2>
              <p className="mt-6 text-pretty text-lg leading-relaxed text-muted">
                Where our data is thinner, the score says so: every response carries a
                data-completeness figure and names its degraded sources. We would rather tell you
                than have you find out.
              </p>
            </div>
            <div className="border-t border-border">
              {CHAIN_COVERAGE.map((c) => (
                <div
                  key={c.slug}
                  className="grid gap-2 border-b border-border py-4 sm:grid-cols-[140px_150px_1fr] sm:items-baseline sm:gap-6"
                >
                  <h3 className="font-grotesk text-base font-semibold text-text">{c.name}</h3>
                  <div>
                    <CoverageBadge status={c.status} />
                  </div>
                  <p className="text-pretty text-sm leading-relaxed text-muted">{c.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Borrower gate: honesty as the product */}
      <section id="borrowers" className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <h2 className="max-w-[18ch] text-balance font-grotesk text-3xl font-bold leading-tight tracking-[-0.02em] text-text sm:text-[2.5rem]">
              A credit score should measure how you repay
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted">
              <p className="text-pretty">
                Offchain bureaus do not score someone who has never used credit. ChainScore works
                the same way. We only rate wallets with a real borrowing record, because repayment
                is the behavior a credit score exists to measure.
              </p>
              <p className="text-pretty">
                If a wallet has never borrowed, the API says exactly that. No invented numbers.
                That honesty is what makes the score worth pricing against.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="flex items-start gap-4 p-7">
              <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-success/10 font-mono text-success">
                ✓
              </span>
              <div>
                <p className="font-grotesk text-lg font-semibold text-text">Has borrowed onchain</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
                  A full 300 to 850 score with calibrated default probability, factor breakdown,
                  and integrity signals.
                </p>
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="flex items-start gap-4 p-7">
              <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-border font-mono text-muted">
                ?
              </span>
              <div>
                <p className="font-grotesk text-lg font-semibold text-text">Never borrowed</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
                  An explicit no-borrow-history flag instead of a misleading score, so your
                  underwriting logic can branch on it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h2 className="max-w-[20ch] text-balance font-grotesk text-3xl font-bold tracking-[-0.02em] text-text sm:text-[2.5rem]">
            From wallet to underwriting signal in one call
          </h2>

          <ol className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="relative sm:pt-8">
                <span className="absolute left-0 top-0 hidden h-px w-full bg-border sm:block" aria-hidden />
                <span className="absolute left-0 top-0 hidden h-px w-10 bg-accent sm:block" aria-hidden />
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-sm text-accent">0{i + 1}</span>
                  <h3 className="font-grotesk text-xl font-semibold text-text">{s.title}</h3>
                </div>
                <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The model's real factor groups */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <h2 className="max-w-[16ch] text-balance font-grotesk text-3xl font-bold leading-tight tracking-[-0.02em] text-text sm:text-[2.5rem]">
              Four factor groups, straight from the model
            </h2>
            <p className="mt-6 text-pretty text-lg leading-relaxed text-muted">
              These are the model&apos;s actual feature groups, not marketing categories. Every
              score response breaks its result down along the same four lines.
            </p>
          </div>

          <div className="border-t border-border">
            {FACTOR_GROUPS.map((g) => (
              <div
                key={g.name}
                className="grid gap-2 border-b border-border py-6 sm:grid-cols-[200px_1fr] sm:gap-8"
              >
                <h3 className="font-grotesk text-lg font-semibold text-text">{g.name}</h3>
                <p className="text-pretty text-[15px] leading-relaxed text-muted">{g.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Retrospective: the proof asset */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <h2 className="max-w-[20ch] text-balance font-grotesk text-3xl font-bold leading-tight tracking-[-0.02em] text-text sm:text-[2.5rem]">
              We publish the backtest, misses included
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted">
              <p className="text-pretty">
                Would ChainScore have flagged the wallets that got liquidated? The retrospective
                answers with real holdout data: recall, false positives, calibration, and where the
                model is weakest. Zero lookahead, reproducible, updated with the model.
              </p>
              <p className="text-pretty">
                Most scoring products show you their wins. Underwriters need the whole confusion
                matrix.
              </p>
            </div>
            <Link
              href="/retrospective"
              className="mt-8 inline-block rounded-xl bg-accent px-7 py-3.5 font-grotesk text-sm font-semibold text-white transition-all hover:bg-accent/90 active:translate-y-px"
            >
              Read the retrospective
            </Link>
          </div>

          <dl className="border-t border-border">
            {METHODOLOGY.map((m) => (
              <div
                key={m.label}
                className="flex items-baseline justify-between gap-6 border-b border-border py-5"
              >
                <dt className="text-[15px] text-muted">{m.label}</dt>
                <dd className="text-right font-grotesk text-lg font-semibold text-text">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Developer / API */}
      <section id="api" className="mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <h2 className="max-w-[18ch] text-balance font-grotesk text-3xl font-bold leading-tight tracking-[-0.02em] text-text sm:text-[2.5rem]">
              A versioned API built for underwriting
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted">
              <p className="text-pretty">
                Authenticated scoring with hashed bearer keys, signed score-change webhooks for
                monitored wallets, per-key rate limits, and an OpenAPI 3.1 spec. Every response is
                versioned and carries its provenance: model version, as-of time, data completeness.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="/api/v1/openapi"
                className="rounded-xl bg-accent px-7 py-3.5 text-center font-grotesk text-sm font-semibold text-white transition-all hover:bg-accent/90 active:translate-y-px"
              >
                OpenAPI spec
              </a>
              <a
                href="mailto:api@chainscore.dev?subject=API%20key%20request"
                className="rounded-xl border border-border bg-card px-7 py-3.5 text-center font-grotesk text-sm font-semibold text-text transition-all hover:border-accent/40 active:translate-y-px"
              >
                Request an API key
              </a>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card p-6">
            <pre className="text-xs leading-relaxed text-muted">
              <code>{`curl https://chainscore.dev/api/v1/score/0xd8dA...6045 \\
  -H "Authorization: Bearer cs_live_..."

{
  "score": 712,
  "grade": "B",
  "calibratedPD": 0.041,
  "factors": [...],
  "integrity": { "flagged": false },
  "dataCompleteness": 1,
  "modelVersion": "v5-xgb-cal",
  "asOf": "..."
}`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <span className="font-grotesk text-lg font-bold text-text">
            Chain<span className="text-accent">Score</span>
          </span>
          <p className="max-w-xl text-pretty text-center text-xs leading-relaxed text-muted sm:text-right">
            ChainScore (chainscore.dev) scores wallets with onchain borrowing history using public
            data only. Scores are informational and are not financial advice.
          </p>
        </div>
      </footer>
    </main>
  )
}
