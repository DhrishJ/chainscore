import Link from 'next/link'
import { WalletInput } from '@/components/WalletInput'
import { RecentScoresTicker } from '@/components/RecentScoresTicker'
import { ScoreGaugePreview } from '@/components/ScoreGaugePreview'

const networks = [
  'Ethereum',
  'Arbitrum',
  'Avalanche',
  'Scroll',
  'Optimism',
  'Base',
  'Polygon',
  'Solana',
]

const stats = [
  { value: '250K+', label: 'Borrowers analyzed' },
  { value: '8', label: 'Networks covered' },
  { value: '300 to 850', label: 'Score range' },
  { value: 'No KYC', label: 'Fully onchain' },
]

const steps = [
  {
    title: 'Paste a wallet',
    body: 'Drop in any address or ENS name. No connection needed to see a score.',
  },
  {
    title: 'We read its loan history',
    body: 'The model scans every borrow, repayment, and liquidation across the lending protocols we track.',
  },
  {
    title: 'Get a credit score',
    body: 'One rating from 300 to 850, with a clear breakdown of the behavior behind it.',
  },
]

const measures = [
  {
    title: 'Repayment behavior',
    body: 'Loans taken and paid back on time are the strongest evidence of creditworthiness, exactly as offchain.',
  },
  {
    title: 'Liquidation history',
    body: 'Past liquidations are the clearest signal of repayment risk and weigh heavily on the score.',
  },
  {
    title: 'Wallet age',
    body: 'How long the address has borrowed onchain. Established borrowers earn more trust than fresh ones.',
  },
  {
    title: 'Borrowing track record',
    body: 'Depth and consistency across Aave and Compound, not a single one off loan.',
  },
  {
    title: 'Portfolio health',
    body: 'Holdings, stablecoin balances, and asset mix show how an account manages risk.',
  },
]

const methodology = [
  { term: 'Loan data', detail: 'Aave and Compound' },
  { term: 'Liquidation records', detail: '25K+ events' },
  { term: 'Model', detail: 'Trained classifier' },
  { term: 'Privacy', detail: 'Public data only' },
]

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 cs-grid" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] cs-glow" aria-hidden />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pt-20 pb-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          {/* Left: copy + input */}
          <div className="cs-rise-lcp text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Onchain credit, for borrowers
            </span>

            <h1 className="mt-7 text-balance font-grotesk text-[2.75rem] font-bold leading-[1.03] tracking-[-0.03em] text-text sm:text-6xl">
              The credit score for{' '}
              <span className="text-accent">onchain borrowers</span>
            </h1>

            <p className="mx-auto mt-6 max-w-[60ch] text-pretty text-lg leading-relaxed text-muted lg:mx-0">
              ChainScore turns a wallet&apos;s borrowing and repayment history into a single score
              from 300 to 850. Built for lenders and protocols that price risk onchain, with no
              paperwork.
            </p>

            <div className="mt-9">
              <WalletInput />
            </div>

            <p className="mt-4 text-sm text-muted">
              We only rate wallets with an onchain borrowing record.{' '}
              <Link href="#borrowers" className="font-medium text-accent hover:underline">
                Why
              </Link>
            </p>
          </div>

          {/* Right: product visual */}
          <div className="cs-rise-lcp" style={{ animationDelay: '120ms' }}>
            <ScoreGaugePreview />
          </div>
        </div>
      </section>

      {/* Network strip + live activity */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-6 py-6 lg:flex-row lg:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
            {networks.map((n) => (
              <span key={n} className="font-grotesk text-sm font-semibold text-text">
                {n}
              </span>
            ))}
          </div>
          <RecentScoresTicker />
        </div>
      </section>

      {/* Stats : a slim divided strip, not elevated metric cards */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <dl className="grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:divide-x sm:divide-border">
          {stats.map((s) => (
            <div key={s.label} className="sm:px-8 sm:first:pl-0">
              <dt className="font-grotesk text-3xl font-bold text-text sm:text-4xl">{s.value}</dt>
              <dd className="mt-1.5 text-sm font-medium text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Built for borrowers : editorial split with a two-state panel */}
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
                If a wallet has never borrowed, we say so plainly. No invented numbers. That honesty
                is what makes the score worth trusting.
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
                  A full 300 to 850 score, with a transparent breakdown of repayment, liquidations,
                  and history.
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
                  An honest no credit history message instead of a misleading score. Borrow and
                  repay to build a record.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works : a real 3-step sequence on a connecting line */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h2 className="max-w-[20ch] text-balance font-grotesk text-3xl font-bold tracking-[-0.02em] text-text sm:text-[2.5rem]">
            From wallet to credit score in seconds
          </h2>

          <ol className="mt-14 grid gap-12 sm:grid-cols-3 sm:gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="relative sm:pt-8">
                <span
                  className="absolute left-0 top-0 hidden h-px w-full bg-border sm:block"
                  aria-hidden
                />
                <span
                  className="absolute left-0 top-0 hidden h-px w-10 bg-accent sm:block"
                  aria-hidden
                />
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

      {/* What we measure : a divided register, not a card grid */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <h2 className="max-w-[16ch] text-balance font-grotesk text-3xl font-bold leading-tight tracking-[-0.02em] text-text sm:text-[2.5rem]">
            Every factor maps to real loan behavior
          </h2>

          <div className="border-t border-border">
            {measures.map((m) => (
              <div
                key={m.title}
                className="grid gap-2 border-b border-border py-6 sm:grid-cols-[200px_1fr] sm:gap-8"
              >
                <h3 className="font-grotesk text-lg font-semibold text-text">{m.title}</h3>
                <p className="text-pretty text-[15px] leading-relaxed text-muted">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data & methodology : editorial split with an inline definition list */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <h2 className="max-w-[20ch] text-balance font-grotesk text-3xl font-bold leading-tight tracking-[-0.02em] text-text sm:text-[2.5rem]">
              Trained on real liquidations, not opinions
            </h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-muted">
              <p className="text-pretty">
                ChainScore learns from the actual outcomes of hundreds of thousands of onchain loans.
                Every borrow, repayment, and liquidation is sourced from protocol data, then used to
                train a model that predicts repayment risk.
              </p>
              <p className="text-pretty">
                The score you see is the model output, mapped to the familiar 300 to 850 range.
              </p>
            </div>
          </div>

          <dl className="border-t border-border">
            {methodology.map((m) => (
              <div
                key={m.term}
                className="flex items-baseline justify-between gap-6 border-b border-border py-5"
              >
                <dt className="text-[15px] text-muted">{m.term}</dt>
                <dd className="font-grotesk text-lg font-semibold text-text">{m.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Marketplace CTA : full-width statement */}
      <section className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h2 className="mx-auto max-w-[18ch] text-balance font-grotesk text-4xl font-bold tracking-[-0.02em] text-text sm:text-5xl">
          Reputation you can borrow against
        </h2>
        <p className="mx-auto mt-6 max-w-[55ch] text-pretty text-lg leading-relaxed text-muted">
          List a loan, fund a borrower, and price risk using verifiable scores instead of guesswork.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/marketplace"
            className="rounded-xl bg-accent px-7 py-3.5 font-grotesk text-sm font-semibold text-white transition-all hover:bg-accent/90 active:translate-y-px"
          >
            Open the marketplace
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-border bg-card px-7 py-3.5 font-grotesk text-sm font-semibold text-text transition-all hover:border-accent/40 active:translate-y-px"
          >
            View your dashboard
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <span className="font-grotesk text-lg font-bold text-text">
            Chain<span className="text-accent">Score</span>
          </span>
          <p className="max-w-xl text-pretty text-center text-xs leading-relaxed text-muted sm:text-right">
            ChainScore scores wallets with onchain borrowing history using public data only. Scores
            are for informational purposes and are not financial advice.
          </p>
        </div>
      </footer>
    </main>
  )
}
