import type { Metadata } from 'next'
import Link from 'next/link'
import report from '@/reports/backtest/latest.json'
import { ChainBarChart, type ChainDatum } from '@/components/retrospective/ChainBarChart'
import { ReliabilityChart } from '@/components/retrospective/ReliabilityChart'
import { SiteFooter } from '@/components/site/SiteFooter'
import { CONFUSION } from '@/lib/site/modelFacts'
import { ACCELERATOR } from '@/lib/site/publicFacts'

export const metadata: Metadata = {
  title: 'The Liquidation Retrospective',
  description:
    'Would ChainScore have flagged the wallets that got liquidated? An honest look at the backtest: recall, false positives, calibration, and where the model is weakest, built from real backtest output.',
  alternates: { canonical: '/retrospective' },
}

// The retrospective is the citable data asset (Phase 5 SEO): a reproducible
// point-in-time backtest published as a Dataset so it can earn links and
// rank as evidence, not marketing. Every number traces to
// reports/backtest/latest.json (D-022).
const datasetSchema = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'ChainScore Liquidation Backtest',
  description:
    'Point-in-time backtest of the ChainScore onchain credit model against real liquidation outcomes: recall, false positive rate, precision, calibration, and per-chain slices. Zero lookahead, reproducible, updated with each model version.',
  url: 'https://chainscore.dev/retrospective',
  creator: { '@id': 'https://chainscore.dev/#organization' },
  license: 'https://chainscore.dev/',
  variableMeasured: ['recall', 'false positive rate', 'precision', 'ROC-AUC', 'PR-AUC', 'calibration'],
  dateModified: (report as { generatedAt: string }).generatedAt,
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

function pct1(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`
}

const fmt = (n: number) => n.toLocaleString('en-US')

export default function RetrospectivePage() {
  const { modelVersion, generatedAt, nRows, positives, sampleBaseRate, targetBaseRate, metrics, reliability, operatingPoint, slices } =
    report

  const generatedDate = new Date(generatedAt)
  const dateLabel = generatedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  const hasTargetBaseRate = typeof targetBaseRate === 'number'

  const chainSlices: ChainDatum[] = Object.entries(slices)
    .filter(([key]) => key.startsWith('chain='))
    .map(([key, value]) => ({
      chain: key.replace('chain=', ''),
      prAuc: value.prAuc,
      rocAuc: value.rocAuc,
      n: value.n,
      positives: value.positives,
    }))

  const weakestChain = chainSlices.reduce(
    (weakest, current) => (current.prAuc < weakest.prAuc ? current : weakest),
    chainSlices[0],
  )

  const reliabilityPoints = reliability.filter((bin) => bin.n > 0)

  const headline = [
    {
      label: 'ROC-AUC',
      value: metrics.rocAuc.toFixed(3),
      description:
        'How well the model ranks a liquidated wallet above a non-liquidated one, picked at random. 0.5 is a coin flip, 1.0 is perfect ranking.',
    },
    {
      label: 'PR-AUC',
      value: metrics.prAuc.toFixed(3),
      description:
        'Precision versus recall tradeoff. More informative than ROC-AUC when positives are rare, and the harder, more honest number to look at here.',
    },
    {
      label: 'Brier score',
      value: metrics.brier.toFixed(3),
      description:
        'Mean squared error between the predicted probability and the actual outcome. Lower is better, 0 would be a perfect forecast.',
    },
    {
      label: 'ECE',
      value: metrics.ece.toFixed(3),
      description:
        'Expected calibration error, how far predicted probabilities drift from observed rates on average. Lower means the score means what it says.',
    },
  ]

  const section = 'frame grid gap-x-[var(--gutter)] gap-y-10 border-t border-text/15 py-[12svh] lg:grid-cols-12'
  const h2 = 't-headline text-[clamp(1.6rem,2.4vw,2.2rem)] text-text'
  const limits = [
    <>
      Liquidation is a proxy for default, not the same thing. A wallet can be liquidated by a price wick while
      remaining a good actor, and a wallet can default in ways that never trigger an onchain liquidation.
    </>,
    <>
      The <span className="text-danger">{pct(operatingPoint.falsePositiveRate)}</span> false positive rate at the
      operating threshold is real: at {pct(operatingPoint.recall)} recall, a large share of the wallets flagged as
      high risk were not liquidated in the outcome window.
    </>,
    <>
      Liquidation inside a fixed window is partly luck: for thin histories, market conditions dominate individual
      behavior. That is the main reason PR-AUC, not ROC-AUC, is the metric to trust here.
    </>,
    <>
      Labels come from covered lending deployments only. A wallet liquidated on an uncovered protocol is recorded
      as a negative in this backtest, which understates the true positive rate somewhat.
    </>,
    <>
      The operating threshold flags <span className="text-text">{pct(operatingPoint.flaggedShare)}</span> of all
      borrowers as high risk, at a precision of {pct1(operatingPoint.precision)}. Precision, not just recall, is
      the number to watch before acting on a flag.
    </>,
  ]

  return (
    <>
      <main className="relative">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }} />

        {/* Masthead */}
        <section className="frame pb-[8svh] pt-12 sm:pt-16" aria-labelledby="retro-heading">
          <p className="t-label text-muted">
            Model {modelVersion}. Backtest generated {dateLabel}.
          </p>
          <h1 id="retro-heading" className="t-display mt-4 max-w-[18ch] text-[clamp(2.4rem,4.6vw,4.4rem)] text-text">
            The liquidation retrospective
          </h1>
          <div className="mt-10 grid grid-cols-1 gap-x-[var(--gutter)] gap-y-8 lg:grid-cols-12">
            <p className="t-headline text-[clamp(1.6rem,2.6vw,2.6rem)] text-text lg:col-span-6">
              Would ChainScore have flagged the wallets that got liquidated?
            </p>
            <p className="t-body text-muted lg:col-span-5 lg:col-start-8">
              On {fmt(nRows)} borrowers it had never seen, {fmt(positives)} of whom were later liquidated, ChainScore
              would have flagged <span className="text-text">{pct(operatingPoint.recall)}</span> of those later
              liquidated, while flagging <span className="text-danger">{pct(operatingPoint.falsePositiveRate)}</span>{' '}
              of those that were not. Both numbers are on this page, measured the same way.
            </p>
          </div>
        </section>


        {/* Headline metrics */}
        <section className={section} aria-labelledby="metrics-heading">
          <div className="lg:col-span-4">
            <h2 id="metrics-heading" className={h2}>
              How good is the model, really?
            </h2>
            <p className="t-body mt-5 text-muted">
              The sample base rate in this backtest is {pct1(sampleBaseRate)} liquidated
              {hasTargetBaseRate && targetBaseRate !== null && (
                <>
                  , oversampled from a deployed base rate closer to {pct1(targetBaseRate)}. Positives are oversampled so
                  ranking quality can be measured precisely, not to flatter the model
                </>
              )}
              .
            </p>
          </div>
          <dl className="grid gap-x-[var(--gutter)] gap-y-10 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
            {headline.map((m) => (
              <div key={m.label} className="border-t border-text/15 pt-4">
                <dt className="t-label text-muted">{m.label}</dt>
                <dd className="t-figure mt-1 text-[2.6rem] font-medium text-text">{m.value}</dd>
                <dd className="t-body mt-3 max-w-[34ch] text-[0.95rem] text-muted">{m.description}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Confusion matrix */}
        <section className={section} aria-labelledby="matrix-heading">
          <div className="lg:col-span-4">
            <h2 id="matrix-heading" className={h2}>
              Wins and misses, counted the same way
            </h2>
            <p className="t-body mt-5 text-muted">
              At the operating cutoff of {operatingPoint.scoreCutoff} the model flags {fmt(CONFUSION.tp)} of the{' '}
              {fmt(positives)} wallets that went on to be liquidated and misses {fmt(CONFUSION.fn)}. It also flags{' '}
              {fmt(CONFUSION.fp)} of the {fmt(nRows - positives)} that were fine. At the deployed base rate, precision
              at this cutoff is {pct1(operatingPoint.precision)}.
            </p>
          </div>
          <div className="lg:col-span-7 lg:col-start-6">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Holdout outcomes at the operating cutoff</caption>
              <thead>
                <tr className="border-y border-text/15">
                  <td className="py-3" />
                  <th scope="col" className="t-label py-3 pl-4 text-right font-normal text-muted">
                    Liquidated
                  </th>
                  <th scope="col" className="t-label py-3 pl-4 text-right font-normal text-muted">
                    Not liquidated
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Flagged', `score below ${operatingPoint.scoreCutoff}`, CONFUSION.tp, CONFUSION.fp],
                  ['Cleared', `${operatingPoint.scoreCutoff} and up`, CONFUSION.fn, CONFUSION.tn],
                ].map(([name, rule, a, b], row) => (
                  <tr key={name as string} className="border-b border-text/15">
                    <th scope="row" className="py-6 pr-4 align-top font-normal">
                      <span className="block text-[1rem] text-text">{name}</span>
                      <span className="t-label text-muted">{rule}</span>
                    </th>
                    <td className={`t-figure py-5 pl-4 text-right align-top text-[1.8rem] ${row === 0 ? 'text-danger' : 'text-text'}`}>
                      {fmt(a as number)}
                    </td>
                    <td className="t-figure py-5 pl-4 text-right align-top text-[1.8rem] text-text">{fmt(b as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Chain chart */}
        <section className={section} aria-labelledby="chain-heading">
          <div className="lg:col-span-4">
            <h2 id="chain-heading" className={h2}>
              Not every chain is equally predictable
            </h2>
            <p className="t-body mt-5 text-muted">
              PR-AUC by chain, from the same backtest. The weakest slice is{' '}
              <span className="capitalize text-danger">{weakestChain.chain}</span> at {pct1(weakestChain.prAuc)} PR-AUC,
              where {fmt(weakestChain.positives)} of {fmt(weakestChain.n)} borrowers in that slice were liquidated.
              Thinner or noisier liquidation history on a chain makes the ranking harder to learn.
            </p>
          </div>
          <figure className="lg:col-span-7 lg:col-start-6">
            <ChainBarChart data={chainSlices} weakestChain={weakestChain.chain} />
            <figcaption className="t-label mt-4 text-muted">PR-AUC by chain, highest to lowest. The weakest is in red.</figcaption>
          </figure>
        </section>

        {/* Reliability */}
        <section className={section} aria-labelledby="calibration-heading">
          <div className="lg:col-span-4">
            <h2 id="calibration-heading" className={h2}>
              Does the predicted risk match what happened?
            </h2>
            <p className="t-body mt-5 text-muted">
              Each point groups wallets by predicted risk and plots it against the liquidation rate actually observed in
              that group. The dashed line is perfect calibration. Points above it mean ChainScore underestimated risk
              there; points below mean it overestimated. Expected calibration error across all bins is{' '}
              {metrics.ece.toFixed(3)}.
            </p>
          </div>
          <figure className="lg:col-span-7 lg:col-start-6">
            <ReliabilityChart data={reliabilityPoints} />
            <figcaption className="t-label mt-4 text-muted">
              Reliability diagram, {reliabilityPoints.length} bins. Dashed: perfect calibration.
            </figcaption>
          </figure>
        </section>

        {/* Limitations */}
        <section className={section} aria-labelledby="limitations-heading">
          <h2 id="limitations-heading" className={`${h2} lg:col-span-4`}>
            What this does not prove
          </h2>
          <div className="lg:col-span-7 lg:col-start-6">
            <ul>
              {limits.map((item, i) => (
                <li key={i} className="border-t border-text/15 py-5 first:border-t-0 first:pt-0">
                  <p className="t-body text-text">{item}</p>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/#api" className="btn btn-ink">
                Score wallets with the API
              </Link>
              <Link href="/" className="btn btn-line">
                Back to the home page
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter
        modelVersion={modelVersion}
        backtestDate={dateLabel}
        alta={ACCELERATOR}
      />
    </>
  )
}
