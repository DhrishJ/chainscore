import Link from 'next/link'
import type { PublicStat } from '@/lib/site/publicFacts'
import { SectionLabel } from './SectionLabel'

// Captions for the backtest stage. Five viewport-tall beats; the sculpture
// behind them changes state as each one reaches the middle of the screen.
// Every figure is computed from reports/backtest/latest.json by the page.

export interface BacktestFigures {
  holdout: number
  liquidated: number
  fine: number
  cutoff: number
  tp: number
  fn: number
  fp: number
  recallPct: string
  fprPct: string
  sampleRatePct: string
  targetRatePct: string
  precisionPct: string
  rocAuc: string
}

const fmt = (n: number) => n.toLocaleString('en-US')

function Beat({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="frame flex h-[100svh] items-end pb-0 lg:items-center">
      <div className={`-mx-[var(--gutter)] w-[calc(100%+2*var(--gutter))] border-t border-text/15 bg-background px-[var(--gutter)] pb-[6svh] pt-5 sm:mx-0 sm:w-full sm:max-w-xl sm:border sm:p-6 lg:max-w-none lg:border-0 lg:bg-transparent lg:p-0 ${className}`}>
        <div className="lg:w-[34%]">{children}</div>
      </div>
    </div>
  )
}

export function BacktestStory({ f, methodology }: { f: BacktestFigures; methodology: PublicStat[] }) {
  return (
    <>
      <Beat>
        <SectionLabel index="06" name="Proof" aside="Holdout backtest" />
        <h2 data-lines className="t-headline mt-8 text-[clamp(2.5rem,4.4vw,4.75rem)] text-text">
          <span className="lm">
            <span>We publish the</span>
          </span>
          <span className="lm">
            <span style={{ ['--d' as string]: '70ms' }}>backtest, misses</span>
          </span>
          <span className="lm">
            <span style={{ ['--d' as string]: '140ms' }}>included.</span>
          </span>
        </h2>
        <p data-reveal className="t-body mt-6 max-w-[38ch] text-muted">
          Here it is as an object. Each block is one of the {fmt(f.holdout)} borrowers in the
          holdout, wallets the model never saw in training, each scored only on what was knowable at
          the time.
        </p>
      </Beat>

      <Beat>
        <p className="t-label text-muted">Outcome</p>
        <p className="t-display tnum mt-3 text-[clamp(4.5rem,9vw,9rem)] text-danger">{fmt(f.liquidated)}</p>
        <p className="t-headline mt-2 text-[1.9rem] text-text">were liquidated in the outcome window.</p>
        <p className="t-body mt-5 max-w-[38ch] text-muted">
          Liquidation is the event the model is trained to predict. The holdout oversamples it,{' '}
          {f.sampleRatePct} of rows against roughly {f.targetRatePct} in deployment, so ranking
          quality can be measured precisely.
        </p>
      </Beat>

      <Beat>
        <p className="t-label text-muted">Operating cutoff</p>
        <p className="t-display tnum mt-3 text-[clamp(4.5rem,9vw,9rem)] text-accent">{f.cutoff}</p>
        <p className="t-headline mt-2 text-[1.9rem] text-text">One line, applied to every wallet.</p>
        <p className="t-body mt-5 max-w-[38ch] text-muted">
          Score below {f.cutoff} and the wallet is flagged as high risk. At {f.cutoff} or above, it
          is cleared. This is the operating point the published backtest is measured at.
        </p>
      </Beat>

      <Beat>
        <p className="t-label text-muted">Result</p>
        <p className="t-display tnum mt-3 text-[clamp(3.4rem,6.6vw,6.75rem)] text-text">
          <span className="text-danger">{f.recallPct}</span> caught.
          <br />
          {f.fprPct} false alarms.
        </p>
        <p className="t-body mt-5 max-w-[40ch] text-muted">
          The cutoff flags {fmt(f.tp)} of the {fmt(f.liquidated)} wallets that were liquidated and
          misses {fmt(f.fn)}. It also flags {fmt(f.fp)} of the {fmt(f.fine)} that were fine. At the
          deployed base rate that is a precision of {f.precisionPct}, so a flag is a reason to look
          closer, not a verdict. We publish both numbers.
        </p>
      </Beat>

      <Beat>
        <p className="t-label text-muted">Ranking quality</p>
        <p className="t-display tnum mt-3 text-[clamp(4.5rem,9vw,9rem)] text-text">{f.rocAuc}</p>
        <p className="t-headline mt-2 text-[1.9rem] text-text">ROC-AUC on the holdout.</p>
        <dl className="mt-7">
          {methodology.map((m) => (
            <div key={m.label} className="flex items-baseline justify-between gap-6 border-t border-text/20 py-3">
              <dt className="t-body text-[0.95rem] text-muted">{m.label}</dt>
              <dd className="t-label text-right text-text">{m.value}</dd>
            </div>
          ))}
        </dl>
        <Link href="/retrospective" className="btn btn-ink mt-8 w-full sm:w-auto">
          <span>Read the full retrospective</span>
          <span className="btn-arrow" aria-hidden>
            →
          </span>
        </Link>
      </Beat>
    </>
  )
}
