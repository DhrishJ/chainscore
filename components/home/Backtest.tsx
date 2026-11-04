import Link from 'next/link'

// The published backtest, as plainly as it can be put: one table and four
// numbers. Every figure is computed by the page from
// reports/backtest/latest.json (lib/site/modelFacts), pinned by tests.

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
    { value: f.recallPct, text: 'of the wallets that were liquidated had been flagged.' },
    { value: f.fprPct, text: 'of the wallets that stayed healthy were flagged too.' },
    { value: f.precisionPct, text: `of flags turn out to be liquidations at a ${f.targetRatePct} base rate.` },
    { value: f.rocAuc, text: 'ROC-AUC: how well the score ranks risky wallets above safe ones.' },
  ]
  return (
    <section id="backtest" aria-labelledby="backtest-heading" className="frame scroll-mt-16 py-[18svh]">
      <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 id="backtest-heading" className="t-display text-[clamp(2.4rem,4.4vw,5rem)] text-text">
            Tested on {fmt(f.holdout)} borrowers it never saw.
          </h2>
          <p className="t-body mt-6 max-w-[42ch] text-muted">
            Every model version is scored against a held-out set of borrowers, using only what was knowable at the
            time, and then checked against what happened. These are the results for {f.version}, misses included.
          </p>
          <p className="t-body mt-4 max-w-[42ch] text-muted">
            The set oversamples liquidations ({f.sampleRatePct} of rows, against about {f.targetRatePct} in practice) so
            the misses can be counted precisely.
          </p>
        </div>

        <div className="lg:col-span-7 lg:col-start-6 xl:col-span-6 xl:col-start-7">
          <table className="w-full border-collapse text-left">
            <caption className="t-label pb-4 text-left text-muted">
              Outcomes at the operating cutoff of {f.cutoff}, holdout of {fmt(f.holdout)} wallets, published {f.generated}.
            </caption>
            <thead>
              <tr className="border-y border-text/15">
                <td className="py-3" />
                <th scope="col" className="t-label py-3 pl-4 font-normal text-muted">
                  Liquidated
                </th>
                <th scope="col" className="t-label py-3 pl-4 font-normal text-muted">
                  Not liquidated
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-text/15">
                <th scope="row" className="py-6 pr-4 align-top font-normal">
                  <span className="t-headline block text-[1.35rem] text-text">Flagged</span>
                  <span className="t-label text-muted">score below {f.cutoff}</span>
                </th>
                <td className="t-display py-6 pl-4 align-top text-[clamp(2.4rem,4vw,4.2rem)] text-danger">{fmt(f.tp)}</td>
                <td className="t-display py-6 pl-4 align-top text-[clamp(2.4rem,4vw,4.2rem)] text-text">{fmt(f.fp)}</td>
              </tr>
              <tr className="border-b border-text/15">
                <th scope="row" className="py-6 pr-4 align-top font-normal">
                  <span className="t-headline block text-[1.35rem] text-text">Cleared</span>
                  <span className="t-label text-muted">{f.cutoff} and up</span>
                </th>
                <td className="t-display py-6 pl-4 align-top text-[clamp(2.4rem,4vw,4.2rem)] text-text">{fmt(f.fn)}</td>
                <td className="t-display py-6 pl-4 align-top text-[clamp(2.4rem,4vw,4.2rem)] text-text">{fmt(f.tn)}</td>
              </tr>
            </tbody>
          </table>

          <dl className="mt-12 grid gap-x-[var(--gutter)] gap-y-8 sm:grid-cols-2">
            {stats.map((s) => (
              <div key={s.value}>
                <dt className="t-headline text-[2.2rem] text-text">{s.value}</dt>
                <dd className="t-body mt-1 max-w-[30ch] text-[0.98rem] text-muted">{s.text}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 border-t border-text/15 pt-6">
            <p className="t-body max-w-[52ch] text-text">
              So a flag is a reason to look closer, not a verdict. The cutoff gives up precision to catch most
              liquidations, which is the trade a lender usually wants. If yours is different, pick another point on the
              curve.
            </p>
            <Link href="/retrospective" className="link-u mt-5 inline-block text-[0.9375rem] text-text">
              The full retrospective: calibration, every chain, and the limits
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
