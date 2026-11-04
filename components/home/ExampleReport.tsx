// What a lender gets back, shown as the product shows it: the report for
// the example wallet whose JSON appears in the API section. Every field
// comes from lib/site/apiExample's envelope (score, grade, percentile and
// PD computed from the real model band and deciles; pinned by test).

export interface ReportFactor {
  name: string
  rawScore: number
  weight: number
  explanation: string
}

export interface ReportData {
  address: string
  chain: string
  asOf: string
  score: number
  grade: string
  percentile: number
  pdPct: string
  completenessPct: string
  modelVersion: string
  factors: ReportFactor[]
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function ExampleReport({ r }: { r: ReportData }) {
  return (
    <section id="report" aria-labelledby="report-heading" className="scroll-mt-20 py-16 lg:py-24">
      {/* the instrument faces front here: its sub-dials read this report */}
      <div data-stop="report">
        <h2 id="report-heading" className="t-headline text-[clamp(1.6rem,2.4vw,2.2rem)] text-text">
          What a lender gets back
        </h2>
        <p className="t-body mt-3 max-w-[56ch] text-muted">
          Every score arrives with the numbers behind it. This is the report for an example wallet; the API returns
          the same fields as JSON.
        </p>
      </div>

      <article className="mt-8 border border-text/15 bg-card" aria-label="Example score report">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-text/10 px-5 py-3">
          <span className="t-code text-text">{short(r.address)}</span>
          <span className="t-label text-muted">
            {r.chain} · as of {r.asOf} · model {r.modelVersion}
          </span>
        </header>

        <div className="grid gap-6 px-5 py-6 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-10">
          <div>
            <p className="t-label text-muted">Score</p>
            <p className="t-figure mt-1 text-[3.6rem] font-medium leading-none text-text">{r.score}</p>
            <p className="t-label mt-2 text-text">
              Grade {r.grade} · higher than {r.percentile}% of scored wallets
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <dt className="t-label text-muted">Probability of default</dt>
              <dd className="t-figure mt-0.5 text-[1.25rem] text-text">{r.pdPct}</dd>
            </div>
            <div>
              <dt className="t-label text-muted">Data completeness</dt>
              <dd className="t-figure mt-0.5 text-[1.25rem] text-text">{r.completenessPct}</dd>
            </div>
            <div>
              <dt className="t-label text-muted">Integrity checks</dt>
              <dd className="mt-0.5 text-[1rem] text-text">No flags</dd>
            </div>
            <div>
              <dt className="t-label text-muted">Borrowing record</dt>
              <dd className="mt-0.5 text-[1rem] text-text">Aave and Compound</dd>
            </div>
          </dl>
        </div>

        {/* the instrument turns around here, to its factor wheels */}
        <div data-stop="factors" className="border-t border-text/10 px-5 py-5">
          <p className="t-label text-muted">Factor breakdown</p>
          <ul className="mt-3">
            {r.factors.map((f) => (
              <li key={f.name} className="border-t border-text/10 py-3 first:border-t-0">
                <div className="grid grid-cols-[minmax(0,10.5rem)_1fr_2.5rem] items-center gap-4">
                  <span className="text-[0.9375rem] text-text">{f.name}</span>
                  <span className="h-1 bg-text/10" aria-hidden>
                    <span className="block h-1 bg-text/80" style={{ width: `${f.rawScore}%` }} />
                  </span>
                  <span className="t-figure text-right text-[0.9375rem] text-text">{f.rawScore}</span>
                </div>
                <p className="t-label mt-1.5 max-w-[60ch] text-muted">
                  {f.explanation} Weight {Math.round(f.weight * 100)}%.
                </p>
              </li>
            ))}
          </ul>
        </div>
      </article>
      <p className="t-label mt-3 text-muted">
        An example wallet. Probability, grade and percentile follow the model&apos;s real score band and deciles.
      </p>
    </section>
  )
}
