// Numbers the home page derives from the model and the published backtest,
// computed here (server side) so the page can never drift from the
// artifacts it describes. Pinned by tests/unit/modelFacts.test.ts.
//
//  - ml/model_meta.json: score band, grade cutoffs, factor groups.
//  - reports/backtest/latest.json: the holdout, the operating point.

import modelMeta from '@/ml/model_meta.json'
import report from '@/reports/backtest/latest.json'
import { gradeForScore } from '@/lib/site/scoreTier'

interface ScoreBand {
  offset: number
  factor: number
  score_min: number
  score_max: number
}

const meta = modelMeta as unknown as {
  model_version: string
  feature_names: string[]
  factor_groups: Record<string, string[]>
  score_band: ScoreBand
  grade_cutoffs: { A: number; B: number; C: number; D: number }
  score_distribution: Record<string, number>
}

export const MODEL_VERSION = meta.model_version
export const SCORE_MIN = meta.score_band.score_min
export const SCORE_MAX = meta.score_band.score_max
export const GRADE_CUTOFFS = meta.grade_cutoffs
export const FEATURE_COUNT = meta.feature_names.length

/** Features per factor group, in the model's group order. */
export const FACTOR_FEATURE_COUNTS: Array<{ name: string; features: number }> = Object.entries(
  meta.factor_groups
).map(([name, features]) => ({ name, features: features.length }))

/**
 * Calibrated probability of default implied by a score, inverting the
 * model's points-to-double-odds band: score = offset + factor * ln(odds).
 */
export function pdForScore(score: number): number {
  const { offset, factor } = meta.score_band
  return 1 / (1 + Math.exp((score - offset) / factor))
}

/**
 * Percentile of a score among scored borrowers, interpolated between the
 * model's exported deciles exactly as lib/data/mlScorer.ts does.
 */
export function percentileForScore(score: number): number {
  const dist = meta.score_distribution
  const pts: Array<[number, number]> = [[SCORE_MIN, 0]]
  for (const q of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
    const s = dist[`p${q}`]
    if (typeof s === 'number') pts.push([s, q])
  }
  pts.push([SCORE_MAX, 100])
  pts.sort((a, b) => a[0] - b[0])
  for (let i = 1; i < pts.length; i++) {
    if (score <= pts[i][0]) {
      const [s0, p0] = pts[i - 1]
      const [s1, p1] = pts[i]
      const t = (score - s0) / (s1 - s0 || 1)
      return Math.round(Math.min(100, Math.max(1, p0 + t * (p1 - p0))))
    }
  }
  return 99
}

// ---------- The published backtest ----------

const op = report.operatingPoint

export const BACKTEST = {
  modelVersion: report.modelVersion,
  generatedAt: report.generatedAt,
  holdout: report.nRows,
  liquidated: report.positives,
  cutoff: op.scoreCutoff,
  recall: op.recall,
  falsePositiveRate: op.falsePositiveRate,
  precisionAtDeployedRate: op.precision,
  sampleBaseRate: report.sampleBaseRate,
  targetBaseRate: report.targetBaseRate,
  rocAuc: report.metrics.rocAuc,
}

/**
 * The confusion matrix at the operating cutoff, as whole wallets. Recall
 * and FPR in the report are exact ratios of these integers, so rounding
 * recovers the counts exactly.
 */
export const CONFUSION = (() => {
  const positives = report.positives
  const negatives = report.nRows - report.positives
  const tp = Math.round(op.recall * positives)
  const fp = Math.round(op.falsePositiveRate * negatives)
  return { tp, fn: positives - tp, fp, tn: negatives - fp }
})()

// ---------- The instrument's illustrative readings ----------

export interface IllustrativeReading {
  score: number
  pd: number
  completeness: number
  grade: string
}

// Example wallets for the hero instrument. Scores are illustrative and
// labelled as such on the page; PD and grade are what the model's real
// band and cutoffs imply for each score.
const EXAMPLES: Array<{ score: number; completeness: number }> = [
  { score: 742, completeness: 1 },
  { score: 611, completeness: 0.93 },
  { score: 803, completeness: 1 },
  { score: 468, completeness: 0.78 },
  { score: 688, completeness: 1 },
]

export const ILLUSTRATIVE_READINGS: IllustrativeReading[] = EXAMPLES.map((e) => ({
  score: e.score,
  completeness: e.completeness,
  pd: pdForScore(e.score),
  grade: gradeForScore(e.score),
}))

export function formatPct(fraction: number, digits = 0): string {
  const v = fraction * 100
  return `${v.toFixed(digits)}%`
}

export function formatPd(pd: number): string {
  const pct = pd * 100
  return pct < 1 ? `${pct.toFixed(2)}%` : `${pct.toFixed(1)}%`
}
