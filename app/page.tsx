import { Hero } from '@/components/home/Hero'
import { ExampleReport, type ReportData } from '@/components/home/ExampleReport'
import { NoHistory } from '@/components/home/NoHistory'
import { Backtest, type BacktestFigures } from '@/components/home/Backtest'
import { InstrumentRail, type RailReading } from '@/components/home/InstrumentRail'
import { Api } from '@/components/home/Api'
import { Coverage } from '@/components/home/Coverage'
import { SiteFooter } from '@/components/site/SiteFooter'
import { ACCELERATOR, CHAIN_COVERAGE, METHODOLOGY } from '@/lib/site/publicFacts'
import {
  BACKTEST,
  CONFUSION,
  GRADE_CUTOFFS,
  MODEL_VERSION,
  SCORE_MAX,
  SCORE_MIN,
  formatPct,
  formatPd,
} from '@/lib/site/modelFacts'
import { consoleTabs, scoredEnvelope } from '@/lib/site/apiExample'

// The home page leads with the product: the score check, a full example
// report, the no-history answer, and the published backtest, with the
// ChainScore instrument reading each of them beside the text. Every figure
// renders from lib/site/publicFacts (Facts Registry, G3) or is computed from
// ml/model_meta.json and reports/backtest/latest.json by lib/site/modelFacts;
// the example wallet is lib/site/apiExample's envelope. All pinned by tests.

export default function Home() {
  const generated = new Date(BACKTEST.generatedAt)
  const dateLong = generated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const example = scoredEnvelope()

  const report: ReportData = {
    address: example.address,
    chain: 'Ethereum',
    asOf: new Date(example.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
    score: example.score,
    grade: example.grade,
    percentile: example.percentile,
    pdPct: formatPd(example.calibratedPD),
    completenessPct: formatPct(example.dataCompleteness),
    modelVersion: example.modelVersion,
    factors: example.factors,
  }

  const figures: BacktestFigures = {
    holdout: BACKTEST.holdout,
    liquidated: BACKTEST.liquidated,
    fine: BACKTEST.holdout - BACKTEST.liquidated,
    cutoff: BACKTEST.cutoff,
    tp: CONFUSION.tp,
    fn: CONFUSION.fn,
    fp: CONFUSION.fp,
    tn: CONFUSION.tn,
    recallPct: formatPct(BACKTEST.recall),
    fprPct: formatPct(BACKTEST.falsePositiveRate),
    sampleRatePct: formatPct(BACKTEST.sampleBaseRate),
    targetRatePct: formatPct(BACKTEST.targetBaseRate ?? 0),
    precisionPct: formatPct(BACKTEST.precisionAtDeployedRate, 1),
    rocAuc: BACKTEST.rocAuc.toFixed(3),
    version: MODEL_VERSION,
    generated: dateLong,
  }

  const spec = { min: SCORE_MIN, max: SCORE_MAX, grades: GRADE_CUTOFFS, cutoff: BACKTEST.cutoff, modelVersion: MODEL_VERSION }
  const readings: Record<string, RailReading> = {
    example: {
      state: { reading: { kind: 'score', score: example.score }, zone: false, tilt: [-0.26, 0.3] },
      caption: `The example wallet: ${example.score}, grade ${example.grade}, ${formatPd(example.calibratedPD)} probability of default.`,
    },
    none: {
      state: { reading: { kind: 'none' }, zone: false, tilt: [-0.2, -0.16] },
      caption: 'A wallet that never borrowed: no reading. The API returns noBorrowHistory: true.',
    },
    cutoff: {
      state: { reading: { kind: 'score', score: BACKTEST.cutoff }, zone: true, tilt: [-0.14, 0.12] },
      caption: `Below ${BACKTEST.cutoff} a wallet is flagged. ${formatPct(BACKTEST.recall)} of the wallets later liquidated scored there.`,
    },
  }

  return (
    <main id="main" className="relative">
      <InstrumentRail spec={spec} readings={readings}>
        <Hero alta={ACCELERATOR} />
        <ExampleReport r={report} />
        <NoHistory />
        <Backtest f={figures} />
      </InstrumentRail>
      <Api tabs={consoleTabs()} />
      <Coverage chains={CHAIN_COVERAGE} methodology={METHODOLOGY} />
      <SiteFooter modelVersion={MODEL_VERSION} backtestDate={dateLong} alta={ACCELERATOR} />
    </main>
  )
}
