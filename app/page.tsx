import { Hero } from '@/components/home/Hero'
import { Principle } from '@/components/home/Principle'
import { Anatomy } from '@/components/home/Anatomy'
import { Backtest, type BacktestFigures } from '@/components/home/Backtest'
import { Api } from '@/components/home/Api'
import { Coverage } from '@/components/home/Coverage'
import { SiteFooter } from '@/components/site/SiteFooter'
import { ACCELERATOR, CHAIN_COVERAGE, FACTOR_GROUPS, METHODOLOGY } from '@/lib/site/publicFacts'
import {
  BACKTEST,
  CONFUSION,
  FACTOR_FEATURE_COUNTS,
  FEATURE_COUNT,
  GRADE_CUTOFFS,
  MODEL_VERSION,
  SCORE_MAX,
  SCORE_MIN,
  formatPct,
} from '@/lib/site/modelFacts'
import { consoleTabs } from '@/lib/site/apiExample'
import { EXPLODE_FRAMES } from '@/lib/site/plates'

// The home page. Every figure renders from lib/site/publicFacts (Facts
// Registry, G3) or is computed from ml/model_meta.json and
// reports/backtest/latest.json by lib/site/modelFacts; both are pinned by
// tests. The photographs are renders of the ChainScore calibre
// (docs/DESIGN.md), the page's one recurring image.

export default function Home() {
  const featuresFor = (name: string) => FACTOR_FEATURE_COUNTS.find((g) => g.name === name)?.features ?? 0
  const groups = FACTOR_GROUPS.map((g) => ({ ...g, features: featuresFor(g.name) }))
  const generated = new Date(BACKTEST.generatedAt)
  const dateLong = generated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

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

  return (
    <main id="main" className="relative -mt-[var(--nav-h)]">
      <Hero alta={ACCELERATOR} />
      <Principle />
      <Anatomy
        groups={groups}
        featureCount={FEATURE_COUNT}
        frames={EXPLODE_FRAMES}
        grades={GRADE_CUTOFFS}
        min={SCORE_MIN}
        max={SCORE_MAX}
        cutoff={BACKTEST.cutoff}
      />
      <Backtest f={figures} />
      <Api tabs={consoleTabs()} />
      <Coverage chains={CHAIN_COVERAGE} methodology={METHODOLOGY} />
      <SiteFooter modelVersion={MODEL_VERSION} backtestDate={dateLong} alta={ACCELERATOR} />
    </main>
  )
}
