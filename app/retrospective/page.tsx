import type { Metadata } from 'next'
import report from '@/reports/backtest/latest.json'
import { MetricCard } from '@/components/retrospective/MetricCard'
import { ChainBarChart, type ChainDatum } from '@/components/retrospective/ChainBarChart'
import { ReliabilityChart } from '@/components/retrospective/ReliabilityChart'

export const metadata: Metadata = {
  title: 'The Liquidation Retrospective',
  description:
    'Would ChainScore have flagged the wallets that got liquidated? An honest look at the backtest: recall, false positives, calibration, and where the model is weakest, built from real backtest output.',
  alternates: { canonical: '/retrospective' },
}

// The retrospective is the citable data asset (Phase 5 SEO): a reproducible
// point-in-time backtest published as a Dataset so it can earn links and
// rank as evidence, not marketing.
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

export default function RetrospectivePage() {
  const { modelVersion, generatedAt, nRows, positives, sampleBaseRate, targetBaseRate, metrics, reliability, operatingPoint, slices } =
    report

  const generatedDate = new Date(generatedAt)
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

  const reliabilityPoints = reliability.filter(bin => bin.n > 0)

  return (
    <main className="min-h-screen px-4 py-10 max-w-4xl mx-auto flex flex-col gap-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }}
      />
      {/* Hero */}
      <section className="flex flex-col gap-4" aria-labelledby="retro-heading">
        <p className="text-xs uppercase tracking-widest text-muted">
          Backtest {modelVersion}, generated{' '}
          {generatedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <h1 id="retro-heading" className="font-grotesk text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-text">
          The Liquidation Retrospective
        </h1>
        <p className="text-lg sm:text-xl text-text leading-relaxed">
          Would ChainScore have flagged the wallets that got liquidated?
        </p>
        <p className="text-muted text-base leading-relaxed">
          On {nRows.toLocaleString('en-US')} borrowers it had never seen, {positives.toLocaleString('en-US')} of whom
          were later liquidated, ChainScore would have flagged{' '}
          <span className="text-accent font-semibold">{pct(operatingPoint.recall)}</span> of those later liquidated,
          while flagging <span className="text-danger font-semibold">{pct(operatingPoint.falsePositiveRate)}</span> of
          those that were not.
        </p>
      </section>

      {/* Headline metrics */}
      <section aria-labelledby="metrics-heading" className="flex flex-col gap-4">
        <h2 id="metrics-heading" className="font-grotesk text-xl font-bold text-text">
          How good is the model, really
        </h2>
        <p className="text-muted text-sm leading-relaxed">
          Sample base rate in this backtest is {pct1(sampleBaseRate)} liquidated
          {hasTargetBaseRate && targetBaseRate !== null && (
            <>
              , oversampled from a deployed base rate closer to {pct1(targetBaseRate)}. The backtest oversamples
              positives so ranking quality can be measured precisely, not to flatter the model
            </>
          )}
          .
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="ROC-AUC"
            value={metrics.rocAuc.toFixed(3)}
            description="How well the model ranks a liquidated wallet above a non-liquidated one, picked at random. 0.5 is a coin flip, 1.0 is perfect ranking."
          />
          <MetricCard
            label="PR-AUC"
            value={metrics.prAuc.toFixed(3)}
            description="Precision versus recall tradeoff. More informative than ROC-AUC when positives are rare, and the harder, more honest number to look at here."
          />
          <MetricCard
            label="Brier score"
            value={metrics.brier.toFixed(3)}
            description="Mean squared error between the predicted probability and the actual outcome. Lower is better, 0 would be a perfect forecast."
          />
          <MetricCard
            label="ECE"
            value={metrics.ece.toFixed(3)}
            description="Expected calibration error, how far predicted probabilities drift from observed rates on average. Lower means the score means what it says."
          />
        </div>
      </section>

      {/* Chain chart */}
      <section aria-labelledby="chain-heading" className="flex flex-col gap-4">
        <h2 id="chain-heading" className="font-grotesk text-xl font-bold text-text">
          Not every chain is equally predictable
        </h2>
        <p className="text-muted text-sm leading-relaxed">
          PR-AUC by chain, computed from the same backtest. The weakest slice is{' '}
          <span className="text-danger font-semibold capitalize">{weakestChain.chain}</span> at{' '}
          {pct1(weakestChain.prAuc)} PR-AUC, where {weakestChain.positives.toLocaleString('en-US')} of{' '}
          {weakestChain.n.toLocaleString('en-US')} borrowers in that slice were liquidated. Thinner or noisier
          liquidation history on a chain makes the ranking harder to learn.
        </p>
        <div className="rounded-2xl bg-card border border-border p-4">
          <ChainBarChart data={chainSlices} weakestChain={weakestChain.chain} />
        </div>
      </section>

      {/* Reliability */}
      <section aria-labelledby="calibration-heading" className="flex flex-col gap-4">
        <h2 id="calibration-heading" className="font-grotesk text-xl font-bold text-text">
          Does the predicted risk match what happened
        </h2>
        <p className="text-muted text-sm leading-relaxed">
          Each point groups wallets by predicted risk and plots that predicted risk against the liquidation rate
          actually observed in that group. The dashed line is perfect calibration, where predicted risk equals
          observed outcome. Points above the line mean ChainScore underestimated risk there, points below mean it
          overestimated. ECE across all bins is {metrics.ece.toFixed(3)}.
        </p>
        <div className="rounded-2xl bg-card border border-border p-4">
          <ReliabilityChart data={reliabilityPoints} />
        </div>
      </section>

      {/* Limitations */}
      <section aria-labelledby="limitations-heading" className="flex flex-col gap-4 pb-8">
        <h2 id="limitations-heading" className="font-grotesk text-xl font-bold text-text">
          What this does not prove
        </h2>
        <ul className="text-muted text-sm leading-relaxed list-disc pl-5 flex flex-col gap-2">
          <li>
            Liquidation is a proxy for default, not identical to it. A wallet can be liquidated by a price wick while
            remaining a good actor, and a wallet can default in ways that never trigger an onchain liquidation.
          </li>
          <li>
            The <span className="text-danger font-semibold">{pct(operatingPoint.falsePositiveRate)}</span> false
            positive rate at the operating threshold is real: at {pct(operatingPoint.recall)} recall, a large share of
            the wallets flagged as high risk were not liquidated in the outcome window.
          </li>
          <li>
            Liquidation inside a fixed window is partly luck, market conditions dominate individual behavior for thin
            histories. That is the main reason PR-AUC, not ROC-AUC, is the metric to trust here.
          </li>
          <li>
            Labels come from covered lending deployments only. A wallet liquidated on an uncovered protocol is
            recorded as a negative in this backtest, which understates the true positive rate somewhat.
          </li>
          <li>
            The operating threshold flags{' '}
            <span className="text-text font-semibold">{pct(operatingPoint.flaggedShare)}</span> of all borrowers as
            high risk, at a precision of {pct1(operatingPoint.precision)}. Precision, not just recall, is the number
            to watch before acting on a flag.
          </li>
        </ul>
      </section>
    </main>
  )
}
