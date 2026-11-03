import { describe, expect, it } from 'vitest'
import modelMeta from '@/ml/model_meta.json'
import report from '@/reports/backtest/latest.json'
import {
  BACKTEST,
  CONFUSION,
  FACTOR_FEATURE_COUNTS,
  FEATURE_COUNT,
  GRADE_CUTOFFS,
  ILLUSTRATIVE_READINGS,
  SCORE_MAX,
  SCORE_MIN,
  pdForScore,
  percentileForScore,
} from '@/lib/site/modelFacts'
import { FACTOR_GROUPS } from '@/lib/site/publicFacts'
import { gradeForScore } from '@/lib/site/scoreTier'

// Drift enforcement for the numbers the home page derives (same pattern as
// publicFacts.test.ts): the instrument's dial, the backtest sculpture, and
// the captions must agree with the artifacts they are computed from.

const meta = modelMeta as unknown as {
  feature_names: string[]
  factor_groups: Record<string, string[]>
  score_band: { offset: number; factor: number; score_min: number; score_max: number; anchor_safe_pd: number; anchor_safe_score: number; anchor_risk_pd: number; anchor_risk_score: number }
  score_distribution: Record<string, number>
}

describe('modelFacts: confusion matrix at the operating cutoff', () => {
  it('cells partition the holdout exactly', () => {
    const { tp, fn, fp, tn } = CONFUSION
    expect(tp + fn + fp + tn).toBe(report.nRows)
    expect(tp + fn).toBe(report.positives)
    expect(fp + tn).toBe(report.nRows - report.positives)
  })

  it('cells reproduce the published recall and false positive rate', () => {
    expect(CONFUSION.tp / report.positives).toBeCloseTo(report.operatingPoint.recall, 12)
    expect(CONFUSION.fp / (report.nRows - report.positives)).toBeCloseTo(report.operatingPoint.falsePositiveRate, 12)
  })

  it('the backtest summary mirrors the report', () => {
    expect(BACKTEST.holdout).toBe(report.nRows)
    expect(BACKTEST.liquidated).toBe(report.positives)
    expect(BACKTEST.cutoff).toBe(report.operatingPoint.scoreCutoff)
    expect(BACKTEST.rocAuc).toBe(report.metrics.rocAuc)
  })
})

describe('modelFacts: the score band', () => {
  it('scale ends come from the model', () => {
    expect(SCORE_MIN).toBe(meta.score_band.score_min)
    expect(SCORE_MAX).toBe(meta.score_band.score_max)
    expect(GRADE_CUTOFFS).toEqual((modelMeta as { grade_cutoffs: unknown }).grade_cutoffs)
  })

  it('pdForScore inverts the band at both published anchors', () => {
    const b = meta.score_band
    expect(pdForScore(b.anchor_safe_score)).toBeCloseTo(b.anchor_safe_pd, 6)
    expect(pdForScore(b.anchor_risk_score)).toBeCloseTo(b.anchor_risk_pd, 6)
  })

  it('percentileForScore hits the exported deciles', () => {
    for (const q of [10, 20, 30, 40, 50, 60, 70, 80, 90]) {
      const s = meta.score_distribution[`p${q}`]
      expect(percentileForScore(s)).toBe(q)
    }
  })

  it('illustrative readings carry the PD and grade their score implies', () => {
    for (const r of ILLUSTRATIVE_READINGS) {
      expect(r.pd).toBeCloseTo(pdForScore(r.score), 12)
      expect(r.grade).toBe(gradeForScore(r.score))
      expect(r.score).toBeGreaterThanOrEqual(SCORE_MIN)
      expect(r.score).toBeLessThanOrEqual(SCORE_MAX)
      expect(r.completeness).toBeGreaterThan(0)
      expect(r.completeness).toBeLessThanOrEqual(1)
    }
  })
})

describe('modelFacts: factor groups and feature counts', () => {
  it('feature count is the model feature list', () => {
    expect(FEATURE_COUNT).toBe(meta.feature_names.length)
  })

  it('per-group counts match the model and sum to the total', () => {
    expect(FACTOR_FEATURE_COUNTS.map((g) => g.name)).toEqual(Object.keys(meta.factor_groups))
    for (const g of FACTOR_FEATURE_COUNTS) expect(g.features).toBe(meta.factor_groups[g.name].length)
    expect(FACTOR_FEATURE_COUNTS.reduce((a, g) => a + g.features, 0)).toBe(FEATURE_COUNT)
  })

  it('the site copy names the same groups in the same order', () => {
    expect(FACTOR_GROUPS.map((g) => g.name)).toEqual(FACTOR_FEATURE_COUNTS.map((g) => g.name))
  })
})
