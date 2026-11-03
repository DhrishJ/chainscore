import type { Metadata } from 'next'
import Link from 'next/link'
import report from '@/reports/backtest/latest.json'
import { ChainBarChart, type ChainDatum } from '@/components/retrospective/ChainBarChart'
import { ReliabilityChart } from '@/components/retrospective/ReliabilityChart'
import { ConfusionWaffle } from '@/components/retrospective/ConfusionWaffle'
import { SectionLabel } from '@/components/home/SectionLabel'
import { SiteFooter } from '@/components/site/SiteFooter'
import { CONFUSION } from '@/lib/site/modelFacts'

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

  return (
    <>
      <main className="relative">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }} />

        {/* Masthead */}
        <section className="frame pb-[10svh] pt-10 sm:pt-14" aria-labelledby="retro-heading">
          <div className="grid grid-cols-12 gap-x-[var(--gutter)] border-t border-text/80 pt-3">
            <p className="t-label col-span-6 text-text sm:col-span-4">(R) Retrospective</p>
            <p className="t-label col-span-6 text-right text-muted sm:col-span-8">
              Backtest {modelVersion} · generated {dateLabel}
            </p>
          </div>
          <h1 id="retro-heading" className="t-display mt-12 text-[clamp(3.6rem,10vw,11.5rem)] text-text">
            <span className="cs-rise-lcp block">The Liquidation</span>
            <span className="cs-rise-lcp block" style={{ ['--d' as string]: '90ms' }}>
              Retrospective<span className="text-accent">.</span>
            </span>
          </h1>
          <div className="mt-12 grid gap-x-[var(--gutter)] gap-y-8 lg:grid-cols-12">
            <p className="t-serif text-[clamp(1.9rem,3.4vw,3.4rem)] text-text lg:col-span-7">
              Would ChainScore have flagged the wallets that got liquidated?
            </p>
            <p className="t-body text-muted lg:col-span-4 lg:col-start-9 lg:pt-3">
              On {fmt(nRows)} borrowers it had never seen, {fmt(positives)} of whom were later
              liquidated, ChainScore would have flagged{' '}
              <span className="font-semibold text-text">{pct(operatingPoint.recall)}</span> of those later
              liquidated, while flagging{' '}
              <span className="font-semibold text-danger">{pct(operatingPoint.falsePositiveRate)}</span> of
              those that were not. Both numbers are on this page, measured the same way.
            </p>
          </div>
        </section>

        {/* Headline metrics, as a table of figures */}
        <section className="frame pb-[12svh]" aria-labelledby="metrics-heading">
          <SectionLabel index="R1" name="How good is the model, really" aside="Holdout metrics" />
          <h2 id="metrics-heading" className="sr-only">
            How good is the model, really
          </h2>
          <p data-reveal className="t-body mt-6 max-w-[62ch] text-muted">
            Sample base rate in this backtest is {pct1(sampleBaseRate)} liquidated
            {hasTargetBaseRate && targetBaseRate !== null && (
              <>
                , oversampled from a deployed base rate closer to {pct1(targetBaseRate)}. The backtest
                oversamples positives so ranking quality can be measured precisely, not to flatter the
                model
              </>
            )}
            .
          </p>
          <dl className="mt-8 grid gap-x-[var(--gutter)] sm:grid-cols-2 lg:grid-cols-4">
            {headline.map((m, i) => (
              <div key={m.label} data-reveal className="border-t border-text/25 pt-4" style={{ ['--d' as string]: `${i * 80}ms` }}>
                <dt className="t-label text-muted">{m.label}</dt>
                <dd className="t-display tnum mt-3 text-[clamp(3.4rem,5.5vw,5.5rem)] text-text">{m.value}</dd>
                <dd className="t-body mt-3 max-w-[32ch] text-[0.95rem] text-muted">{m.description}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Confusion matrix */}
        <section className="frame pb-[12svh]" aria-labelledby="matrix-heading">
          <SectionLabel index="R2" name="The whole confusion matrix" aside={`Cutoff ${operatingPoint.scoreCutoff}`} />
          <div className="mt-8 grid gap-x-[var(--gutter)] gap-y-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="matrix-heading" className="t-headline text-[clamp(2.2rem,3.6vw,3.6rem)] text-text">
                Wins and misses, counted the same way.
              </h2>
              <p className="t-body mt-5 text-muted">
                At the operating cutoff the model flags {fmt(CONFUSION.tp)} of the {fmt(positives)}{' '}
                wallets that went on to be liquidated and misses {fmt(CONFUSION.fn)}. It also flags{' '}
                {fmt(CONFUSION.fp)} of the {fmt(nRows - positives)} that were fine. At the deployed base
                rate, precision at this cutoff is {pct1(operatingPoint.precision)}.
              </p>
            </div>
            <div data-reveal className="lg:col-span-7 lg:col-start-6">
              <ConfusionWaffle counts={CONFUSION} cutoff={operatingPoint.scoreCutoff} />
            </div>
          </div>
        </section>

        {/* Chain chart */}
        <section className="frame pb-[12svh]" aria-labelledby="chain-heading">
          <SectionLabel index="R3" name="By chain" aside="PR-AUC" />
          <div className="mt-8 grid gap-x-[var(--gutter)] gap-y-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="chain-heading" className="t-headline text-[clamp(2.2rem,3.6vw,3.6rem)] text-text">
                Not every chain is equally predictable.
              </h2>
              <p className="t-body mt-5 text-muted">
                PR-AUC by chain, computed from the same backtest. The weakest slice is{' '}
                <span className="font-semibold capitalize text-danger">{weakestChain.chain}</span> at{' '}
                {pct1(weakestChain.prAuc)} PR-AUC, where {fmt(weakestChain.positives)} of{' '}
                {fmt(weakestChain.n)} borrowers in that slice were liquidated. Thinner or noisier
                liquidation history on a chain makes the ranking harder to learn.
              </p>
            </div>
            <figure data-reveal className="lg:col-span-7 lg:col-start-6">
              <ChainBarChart data={chainSlices} weakestChain={weakestChain.chain} />
              <figcaption className="t-label mt-4 text-muted">Fig. 2 · PR-AUC by chain, highest to lowest. Weakest in red.</figcaption>
            </figure>
          </div>
        </section>

        {/* Reliability */}
        <section className="frame pb-[12svh]" aria-labelledby="calibration-heading">
          <SectionLabel index="R4" name="Calibration" aside={`ECE ${metrics.ece.toFixed(3)}`} />
          <div className="mt-8 grid gap-x-[var(--gutter)] gap-y-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 id="calibration-heading" className="t-headline text-[clamp(2.2rem,3.6vw,3.6rem)] text-text">
                Does the predicted risk match what happened?
              </h2>
              <p className="t-body mt-5 text-muted">
                Each point groups wallets by predicted risk and plots that predicted risk against the
                liquidation rate actually observed in that group. The dashed line is perfect calibration,
                where predicted risk equals observed outcome. Points above the line mean ChainScore
                underestimated risk there, points below mean it overestimated. ECE across all bins is{' '}
                {metrics.ece.toFixed(3)}.
              </p>
            </div>
            <figure data-reveal className="lg:col-span-7 lg:col-start-6">
              <ReliabilityChart data={reliabilityPoints} />
              <figcaption className="t-label mt-4 text-muted">
                Fig. 3 · Reliability diagram, {reliabilityPoints.length} bins. Dashed: perfect calibration.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Limitations */}
        <section className="frame pb-[14svh]" aria-labelledby="limitations-heading">
          <SectionLabel index="R5" name="Limits" aside="Read before relying on a flag" />
          <div className="mt-8 grid gap-x-[var(--gutter)] gap-y-10 lg:grid-cols-12">
            <h2 id="limitations-heading" className="t-headline text-[clamp(2.2rem,3.6vw,3.6rem)] text-text lg:col-span-4">
              What this does not prove.
            </h2>
            <ol className="lg:col-span-7 lg:col-start-6">
              {[
                <>
                  Liquidation is a proxy for default, not identical to it. A wallet can be liquidated by a
                  price wick while remaining a good actor, and a wallet can default in ways that never
                  trigger an onchain liquidation.
                </>,
                <>
                  The <span className="font-semibold text-danger">{pct(operatingPoint.falsePositiveRate)}</span>{' '}
                  false positive rate at the operating threshold is real: at {pct(operatingPoint.recall)}{' '}
                  recall, a large share of the wallets flagged as high risk were not liquidated in the
                  outcome window.
                </>,
                <>
                  Liquidation inside a fixed window is partly luck, market conditions dominate individual
                  behavior for thin histories. That is the main reason PR-AUC, not ROC-AUC, is the metric to
                  trust here.
                </>,
                <>
                  Labels come from covered lending deployments only. A wallet liquidated on an uncovered
                  protocol is recorded as a negative in this backtest, which understates the true positive
                  rate somewhat.
                </>,
                <>
                  The operating threshold flags{' '}
                  <span className="font-semibold text-text">{pct(operatingPoint.flaggedShare)}</span> of all
                  borrowers as high risk, at a precision of {pct1(operatingPoint.precision)}. Precision, not
                  just recall, is the number to watch before acting on a flag.
                </>,
              ].map((item, i) => (
                <li key={i} data-reveal className="grid grid-cols-[3rem_1fr] gap-4 border-t border-text/20 py-5">
                  <span className="t-label pt-1 text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <p className="t-body text-text">{item}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-14 flex flex-wrap gap-3 lg:ml-[calc((100%-11*var(--gutter))/12*5+5*var(--gutter))]">
            <Link href="/#api" className="btn btn-ink">
              <span>Score wallets with the API</span>
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </Link>
            <Link href="/" className="btn btn-line">
              <span>Back to the instrument</span>
              <span className="btn-arrow" aria-hidden>
                →
              </span>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter
        modelVersion={modelVersion}
        backtestDate={generatedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
      />
    </>
  )
}
