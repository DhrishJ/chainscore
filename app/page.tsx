import Link from 'next/link'
import { WalletInput } from '@/components/WalletInput'
import { RecentScoresTicker } from '@/components/RecentScoresTicker'
import { ScoreGaugePreview } from '@/components/ScoreGaugePreview'

const networks = [
  'Ethereum',
  'Polygon',
  'Arbitrum',
  'Optimism',
  'Base',
  'Avalanche',
  'BNB Chain',
  'Solana',
]

const stats = [
  { value: '90K+', label: 'Borrowers analyzed' },
  { value: '8', label: 'Networks covered' },
  { value: '300 to 850', label: 'Score range' },
  { value: 'No KYC', label: 'Fully onchain' },
]

const steps = [
  {
    n: '01',
    title: 'Paste a wallet',
    body: 'Drop in any address or ENS name. You do not need to connect a wallet to see a score.',
  },
  {
    n: '02',
    title: 'We read its loan history',
    body: 'Our model scans every borrow, repayment, and liquidation the wallet has across the lending protocols we track.',
  },
  {
    n: '03',
    title: 'Get a credit score',
    body: 'Receive a single rating from 300 to 850, with a clear breakdown of the repayment behavior behind it.',
  },
]

const measures = [
  {
    title: 'Repayment behavior',
    body: 'Loans taken and paid back on time are the strongest evidence of creditworthiness, exactly as they are offchain.',
  },
  {
    title: 'Liquidation history',
    body: 'Past liquidations are the clearest signal of repayment risk and weigh heavily on the score.',
  },
  {
    title: 'Wallet age',
    body: 'How long the address has been active onchain. Established borrowers earn more trust than fresh ones.',
  },
  {
    title: 'Borrowing track record',
    body: 'Depth and consistency of activity across Aave and Compound, not just a single one off loan.',
  },
  {
    title: 'Portfolio health',
    body: 'Holdings, stablecoin balances, and asset mix add context to how an account manages risk.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 cs-grid" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] cs-glow" aria-hidden />

        <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-20 sm:pt-28">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            {/* Left: copy + input */}
            <div className="cs-rise text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-widest text-text">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Onchain credit for borrowers
              </span>

              <h1 className="mt-7 font-grotesk text-[2.6rem] font-bold leading-[1.04] tracking-tight text-text sm:text-6xl">
                The credit score for{' '}
                <span className="cs-gradient-text">onchain borrowers</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted lg:mx-0">
                ChainScore turns a wallet&apos;s borrowing and repayment history into one score
                from 300 to 850. Built for lenders, borrowers, and protocols that need to price
                risk with no paperwork and no KYC.
              </p>

              <div className="mt-9">
                <WalletInput />
              </div>

              <p className="mt-4 text-sm text-muted">
                ChainScore only rates wallets with an onchain borrowing record.{' '}
                <Link href="#built-for-borrowers" className="font-medium text-accent hover:underline">
                  Why borrowers only
                </Link>
              </p>

              <div className="mt-6">
                <RecentScoresTicker />
              </div>
            </div>

            {/* Right: product visual */}
            <div className="cs-rise" style={{ animationDelay: '120ms' }}>
              <ScoreGaugePreview />
            </div>
          </div>
        </div>
      </section>

      {/* Network strip */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <span className="font-mono text-xs font-medium uppercase tracking-widest text-muted">
              Loan history read live from
            </span>
            <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
              {networks.map((n) => (
                <span key={n} className="font-grotesk text-sm font-semibold text-text">
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Built for borrowers */}
      <section id="built-for-borrowers" className="mx-auto max-w-7xl px-4 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
              Built for borrowers
            </span>
            <h2 className="mt-4 font-grotesk text-3xl font-bold tracking-tight text-text sm:text-4xl">
              A credit score should measure how you repay
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              Offchain credit bureaus do not score someone who has never used credit. ChainScore
              works the same way. We only rate wallets with a real borrowing record, because
              repayment is the behavior a credit score exists to measure.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              If a wallet has never borrowed, we tell you plainly that there is no credit history
              to score yet. No invented numbers, no guesswork. That honesty is what makes the
              score worth trusting.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-8">
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-success/10 font-mono text-success">✓</span>
                <div>
                  <p className="font-grotesk font-semibold text-text">Has borrowed onchain</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Gets a full 300 to 850 score with a transparent breakdown of repayment,
                    liquidations, and history.
                  </p>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-start gap-4">
                <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-border font-mono text-muted">?</span>
                <div>
                  <p className="font-grotesk font-semibold text-text">Never borrowed</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Sees an honest no credit history message instead of a misleading score.
                    Borrow and repay to build a record.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stat band */}
      <section className="mx-auto max-w-7xl px-4 pb-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-background p-8 text-center">
              <div className="font-grotesk text-3xl font-bold text-text sm:text-4xl">
                {s.value}
              </div>
              <div className="mt-2 text-sm font-medium text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="max-w-2xl">
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
            How it works
          </span>
          <h2 className="mt-4 font-grotesk text-3xl font-bold tracking-tight text-text sm:text-4xl">
            From wallet to credit score in seconds
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            No account, no signup, no connection required. Everything runs on loan data that is
            already public on the blockchain.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-border bg-card p-8 transition-colors hover:border-accent/40"
            >
              <span className="font-mono text-sm font-bold text-accent">{s.n}</span>
              <h3 className="mt-4 font-grotesk text-xl font-semibold text-text">{s.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What we measure */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="max-w-2xl">
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
            What we measure
          </span>
          <h2 className="mt-4 font-grotesk text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Every factor maps to real loan behavior
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            The model is trained on more than ninety thousand real borrowers. Each signal reflects
            something anyone can verify onchain.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {measures.map((m) => (
            <div key={m.title} className="rounded-2xl border border-border bg-card p-8">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              </div>
              <h3 className="font-grotesk text-lg font-semibold text-text">{m.title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Data and methodology credibility section */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="rounded-3xl border border-border bg-card p-10 sm:p-14">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
                Data and methodology
              </span>
              <h2 className="mt-4 font-grotesk text-3xl font-bold tracking-tight text-text sm:text-4xl">
                Trained on real liquidations, not opinions
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-muted">
                ChainScore learns from the actual outcomes of tens of thousands of onchain loans.
                Every borrow, repayment, and liquidation is sourced directly from protocol data,
                then used to train a model that predicts repayment risk.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                The score you see is the model output, mapped to the familiar 300 to 850 range so
                it reads like the credit scores you already know.
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-6">
              <div className="rounded-2xl border border-border bg-background p-6">
                <dt className="text-sm font-medium text-muted">Loan data sources</dt>
                <dd className="mt-2 font-grotesk text-lg font-semibold text-text">Aave and Compound</dd>
              </div>
              <div className="rounded-2xl border border-border bg-background p-6">
                <dt className="text-sm font-medium text-muted">Liquidation records</dt>
                <dd className="mt-2 font-grotesk text-lg font-semibold text-text">25K+ events</dd>
              </div>
              <div className="rounded-2xl border border-border bg-background p-6">
                <dt className="text-sm font-medium text-muted">Model</dt>
                <dd className="mt-2 font-grotesk text-lg font-semibold text-text">Trained classifier</dd>
              </div>
              <div className="rounded-2xl border border-border bg-background p-6">
                <dt className="text-sm font-medium text-muted">Privacy</dt>
                <dd className="mt-2 font-grotesk text-lg font-semibold text-text">Public data only</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Marketplace CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-0 cs-glow" aria-hidden />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="font-grotesk text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Reputation you can borrow against
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              List a loan, fund a borrower, and price risk using verifiable scores instead of
              guesswork. ChainScore turns onchain loan history into a credit market anyone can join.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/marketplace"
                className="rounded-xl bg-accent px-7 py-3.5 text-center font-grotesk text-sm font-semibold text-white transition-colors hover:bg-accent/90"
              >
                Open the marketplace
              </Link>
              <Link
                href="/dashboard"
                className="rounded-xl border border-border bg-background px-7 py-3.5 text-center font-grotesk text-sm font-semibold text-text transition-colors hover:border-accent/40"
              >
                View your dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="font-grotesk text-lg font-bold text-text">
              Chain<span className="text-accent">Score</span>
            </span>
            <p className="max-w-xl text-center text-xs leading-relaxed text-muted sm:text-right">
              ChainScore scores wallets with onchain borrowing history using public data only.
              Scores are for informational purposes and are not financial advice.
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
