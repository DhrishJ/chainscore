import Link from 'next/link'

// The published backtest in one table. Every figure is computed from
// reports/backtest/latest.json (lib/site/modelFacts), pinned by tests. The
// instrument beside this section lights the flagged zone: below the cutoff.

export interface BacktestFigures {
  holdout: number
  liquidated: number
  fine: number
  cutoff: number
  tp: number
  fn: number
  fp: number
  tn: number
  recallPct: string
  fprPct: string
  sampleRatePct: string
  targetRatePct: string
  precisionPct: string
  rocAuc: string
  version: string
  generated: string
}

const fmt = (n: number) => n.toLocaleString('en-US')

export function Backtest({ f }: { f: BacktestFigures }) {
  const stats = [
    { value: f.recallPct, text: 'of the wallets that were later liquidated scored below the cutoff' },
    { value: f.fprPct, text: 'of the wallets that stayed healthy scored below it too' },
    { value: f.precisionPct, text: `of flagged wallets go on to be liquidated, at a ${f.targetRatePct} base rate` },
    { value: f.rocAuc, text: 'ROC-AUC: how well the score ranks risky wallets above safe ones' },
  ]
  return (
    <section id="backtest" data-reading="cutoff" aria-labelledby="backtest-heading" className="scroll-mt-20 py-16 lg:py-24">
      <h2 id="backtest-heading" className="t-headline text-[clamp(1.6rem,2.4vw,2.2rem)] text-text">
        How often it catches liquidations
      </h2>
      <p className="t-body mt-3 max-w-[58ch] text-muted">
        We scored {fmt(f.holdout)} borrowers the model was never trained on, using only what was knowable at the time,
        and checked what happened next. A wallet scoring below {f.cutoff} counts as flagged. These are the results for{' '}
        {f.version}, published {f.generated}.
      </p>

      <table className="mt-8 w-full max-w-[40rem] border-collapse text-left">
        <caption className="sr-only">
          Holdout outcomes at the operating cutoff of {f.cutoff}, {fmt(f.holdout)} wallets
        </caption>
        <thead>
          <tr className="border-y border-text/15">
            <td className="py-2.5" />
            <th scope="col" className="t-label py-2.5 pl-4 text-right font-normal text-muted">
              Liquidated
            </th>
            <th scope="col" className="t-label py-2.5 pl-4 text-right font-normal text-muted">
              Not liquidated
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-text/15">
            <th scope="row" className="py-4 pr-4 text-left font-normal">
              <span className="block text-[1rem] text-text">Flagged</span>
              <span className="t-label text-muted">score below {f.cutoff}</span>
            </th>
            <td className="t-figure py-4 pl-4 text-right text-[1.6rem] text-danger">{fmt(f.tp)}</td>
            <td className="t-figure py-4 pl-4 text-right text-[1.6rem] text-text">{fmt(f.fp)}</td>
          </tr>
          <tr className="border-b border-text/15">
            <th scope="row" className="py-4 pr-4 text-left font-normal">
              <span className="block text-[1rem] text-text">Cleared</span>
              <span className="t-label text-muted">{f.cutoff} and up</span>
            </th>
            <td className="t-figure py-4 pl-4 text-right text-[1.6rem] text-text">{fmt(f.fn)}</td>
            <td className="t-figure py-4 pl-4 text-right text-[1.6rem] text-text">{fmt(f.tn)}</td>
          </tr>
        </tbody>
      </table>

      <dl className="mt-8 grid max-w-[40rem] gap-x-8 gap-y-5 sm:grid-cols-2">
        {stats.map((s) => (
          <div key={s.value}>
            <dt className="t-figure text-[1.6rem] text-text">{s.value}</dt>
            <dd className="t-label mt-0.5 text-muted">{s.text}</dd>
          </div>
        ))}
      </dl>

      <p className="t-body mt-8 max-w-[58ch] text-text">
        A flag is a reason to look closer, not a verdict. The cutoff gives up precision to catch most liquidations,
        which is usually the trade a lender wants; the retrospective shows the whole curve if yours is different.
      </p>
      <p className="t-body mt-3 max-w-[58ch] text-muted">
        The holdout oversamples liquidations ({f.sampleRatePct} of rows, about {f.targetRatePct} in practice) so the
        misses can be counted precisely.
      </p>
      <Link href="/retrospective" className="link-u mt-6 inline-block text-[0.9375rem] text-text">
        Full retrospective: calibration, each chain, and the limits
      </Link>
    </section>
  )
}
