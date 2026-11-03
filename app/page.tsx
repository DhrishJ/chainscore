import { InstrumentStage } from '@/components/home/InstrumentStage'
import { BacktestStage } from '@/components/home/BacktestStage'
import { BacktestStory, type BacktestFigures } from '@/components/home/BacktestStory'
import { Hero } from '@/components/home/Hero'
import { Manifesto } from '@/components/home/Manifesto'
import { Method } from '@/components/home/Method'
import { Process } from '@/components/home/Process'
import { Figures } from '@/components/home/Figures'
import { Coverage } from '@/components/home/Coverage'
import { Api } from '@/components/home/Api'
import { ScrollGauge } from '@/components/home/ScrollGauge'
import { SiteFooter } from '@/components/site/SiteFooter'
import { CHAIN_COVERAGE, FACTOR_GROUPS, HERO_STATS, METHODOLOGY } from '@/lib/site/publicFacts'
import {
  BACKTEST,
  CONFUSION,
  FACTOR_FEATURE_COUNTS,
  FEATURE_COUNT,
  GRADE_CUTOFFS,
  ILLUSTRATIVE_READINGS,
  MODEL_VERSION,
  SCORE_MAX,
  SCORE_MIN,
  formatPct,
} from '@/lib/site/modelFacts'
import { consoleTabs } from '@/lib/site/apiExample'

// One spearhead: B2B risk infrastructure (the score, the published
// backtest, the partner API), told as one instrument. Every figure on this
// page renders from lib/site/publicFacts (Facts Registry, G3) or is
// computed from ml/model_meta.json and reports/backtest/latest.json by
// lib/site/modelFacts; both are pinned by tests. The marketplace stays off
// this page pending the Phase 6 product decision.

export default function Home() {
  const featuresFor = (name: string) => FACTOR_FEATURE_COUNTS.find((g) => g.name === name)?.features ?? 0
  const groups = FACTOR_GROUPS.map((g) => ({ ...g, features: featuresFor(g.name) }))
  const generated = new Date(BACKTEST.generatedAt)

  const figures: BacktestFigures = {
    holdout: BACKTEST.holdout,
    liquidated: BACKTEST.liquidated,
    fine: BACKTEST.holdout - BACKTEST.liquidated,
    cutoff: BACKTEST.cutoff,
    tp: CONFUSION.tp,
    fn: CONFUSION.fn,
    fp: CONFUSION.fp,
    recallPct: formatPct(BACKTEST.recall),
    fprPct: formatPct(BACKTEST.falsePositiveRate),
    sampleRatePct: formatPct(BACKTEST.sampleBaseRate),
    targetRatePct: formatPct(BACKTEST.targetBaseRate ?? 0),
    precisionPct: formatPct(BACKTEST.precisionAtDeployedRate, 1),
    rocAuc: BACKTEST.rocAuc.toFixed(3),
  }

  return (
    <main id="main" className="relative -mt-[var(--nav-h)]">
      <ScrollGauge min={SCORE_MIN} max={SCORE_MAX} grades={GRADE_CUTOFFS} />

      <InstrumentStage
        spec={{
          min: SCORE_MIN,
          max: SCORE_MAX,
          grades: GRADE_CUTOFFS,
          cutoff: BACKTEST.cutoff,
          modelVersion: MODEL_VERSION,
          featureCount: FEATURE_COUNT,
          groupCount: FACTOR_GROUPS.length,
        }}
        readings={ILLUSTRATIVE_READINGS}
        gears={groups.map((g, i) => ({ index: `0${i + 1}`, name: g.name, features: g.features }))}
      >
        <Hero
          modelVersion={MODEL_VERSION}
          backtestMonth={generated.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
        />
        <Manifesto />
        <Method groups={groups} featureCount={FEATURE_COUNT} />
      </InstrumentStage>

      <Process />
      <Figures stats={HERO_STATS} />

      <BacktestStage counts={CONFUSION} cutoff={BACKTEST.cutoff}>
        <BacktestStory f={figures} methodology={METHODOLOGY} />
      </BacktestStage>

      <Coverage chains={CHAIN_COVERAGE} />
      <Api tabs={consoleTabs()} />
      <SiteFooter
        modelVersion={MODEL_VERSION}
        backtestDate={generated.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
      />
    </main>
  )
}
