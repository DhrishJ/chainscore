import { describe, expect, it } from 'vitest'
import {
  Sample,
  baseRateWeights,
  brier,
  operatingPoint,
  prAuc,
  reliabilityBins,
  rocAuc,
} from '@/lib/backtest/metrics'
import { BacktestRow, LookaheadError, runBacktest } from '@/lib/backtest/engine'

function s(p: number, label: 0 | 1, weight = 1): Sample {
  return { p, label, weight }
}

describe('rocAuc', () => {
  it('is 1 for perfect separation', () => {
    expect(rocAuc([s(0.9, 1), s(0.8, 1), s(0.2, 0), s(0.1, 0)])).toBe(1)
  })

  it('is 0 for perfectly inverted ranking', () => {
    expect(rocAuc([s(0.1, 1), s(0.9, 0)])).toBe(0)
  })

  it('is 0.5 when every score ties', () => {
    expect(rocAuc([s(0.5, 1), s(0.5, 0), s(0.5, 1), s(0.5, 0)])).toBe(0.5)
  })

  it('matches a hand-computed mixed case', () => {
    // pos at 0.8 beats both negs (2 wins); pos at 0.3 beats neg at 0.1 only
    // (1 win). 3 wins of 4 pairs = 0.75.
    expect(rocAuc([s(0.8, 1), s(0.5, 0), s(0.3, 1), s(0.1, 0)])).toBe(0.75)
  })
})

describe('prAuc (average precision)', () => {
  it('is 1 for perfect ranking', () => {
    expect(prAuc([s(0.9, 1), s(0.8, 1), s(0.2, 0)])).toBe(1)
  })

  it('matches a hand-computed case', () => {
    // Ranked: 1, 0, 1. AP = (1/2)(1/1) + (1/2)(2/3) = 0.8333...
    expect(prAuc([s(0.9, 1), s(0.5, 0), s(0.3, 1)])).toBeCloseTo(5 / 6, 10)
  })

  it('equals the base rate for uninformative scores', () => {
    // All tied: one pooled group, AP = precision of the pool.
    const samples = [s(0.5, 1), s(0.5, 0), s(0.5, 0), s(0.5, 0)]
    expect(prAuc(samples)).toBeCloseTo(0.25, 10)
  })
})

describe('baseRateWeights', () => {
  it('reweights a balanced sample to the target prevalence', () => {
    const labels: Array<0 | 1> = [1, 1, 0, 0]
    const weights = baseRateWeights(labels, 0.0909)
    const posW = weights[0] * 2
    const totW = weights.reduce((a, b) => a + b, 0)
    expect(posW / totW).toBeCloseTo(0.0909, 6)
  })
})

describe('brier and reliability', () => {
  it('brier is 0 for perfect confident predictions', () => {
    expect(brier([s(1, 1), s(0, 0)])).toBe(0)
  })

  it('brier is 1 for confidently wrong predictions', () => {
    expect(brier([s(0, 1), s(1, 0)])).toBe(1)
  })

  it('reliability bins recover the observed rate', () => {
    const bins = reliabilityBins([s(0.05, 0), s(0.05, 0), s(0.05, 1), s(0.95, 1)])
    expect(bins[0].observedRate).toBeCloseTo(1 / 3, 10)
    expect(bins[9].observedRate).toBe(1)
  })
})

describe('operatingPoint', () => {
  it('computes recall and false positive rate', () => {
    const samples = [s(0.9, 1), s(0.8, 0), s(0.2, 1), s(0.1, 0)]
    const flags = [true, true, false, false]
    const op = operatingPoint(samples, flags, 0.5)
    expect(op.recall).toBe(0.5)
    expect(op.falsePositiveRate).toBe(0.5)
    expect(op.precision).toBe(0.5)
  })
})

// ─────────────────────────────────────────────────────────────
// Engine, including the zero-lookahead guarantee
// ─────────────────────────────────────────────────────────────

const OBS_CUTOFF = 1_717_200_000 // 2024-06-01

function row(overrides: Partial<BacktestRow> = {}): BacktestRow {
  // A plausible borrower feature vector in model/schema.json order (34).
  const features = [
    400, 13.3, 300, 120, 500, 10, 40, 90, 8,
    4, 4, 0, 0, 0, 0, 4, 4, 1, 0, 0,
    2, 1, 1, 0, 5000, 20, 6, 1, 1, 0,
    0.01, 0, 0, 0.75,
  ]
  return {
    address: '0xtest',
    chain: 'ethereum',
    asOfTs: OBS_CUTOFF,
    featuresValidAtTs: OBS_CUTOFF,
    outcomeWindowStartTs: OBS_CUTOFF,
    features,
    label: 0,
    walletAgeDays: 400,
    totalBorrows: 4,
    ...overrides,
  }
}

describe('runBacktest', () => {
  it('scores rows through the real serving model and reports metrics', () => {
    const rows = [
      row({ label: 0 }),
      row({ address: '0xrisky', label: 1, features: row().features.map((v, i) => (i === 18 ? 3 : i === 19 ? 1 : v)) }),
    ]
    const report = runBacktest(rows, { scoreCutoff: 588 })
    expect(report.modelVersion).toBeTruthy()
    expect(report.nRows).toBe(2)
    expect(report.metrics.rocAuc).toBeGreaterThanOrEqual(0)
    expect(report.slices['chain=ethereum'].n).toBe(2)
    expect(report.slices['age>=180d'].n).toBe(2)
  })

  it('REFUSES features observed after the as_of (the leakage test)', () => {
    const poisoned = row({ featuresValidAtTs: OBS_CUTOFF + 1 })
    expect(() => runBacktest([poisoned], { scoreCutoff: 588 })).toThrowError(LookaheadError)
  })

  it('REFUSES an outcome window that opens before the as_of', () => {
    const poisoned = row({ outcomeWindowStartTs: OBS_CUTOFF - 1 })
    expect(() => runBacktest([poisoned], { scoreCutoff: 588 })).toThrowError(LookaheadError)
  })

  it('is deterministic across runs', () => {
    const rows = [row(), row({ address: '0x2', label: 1 })]
    const a = runBacktest(rows, { scoreCutoff: 588, targetBaseRate: 0.0909 })
    const b = runBacktest(rows, { scoreCutoff: 588, targetBaseRate: 0.0909 })
    expect(a.metrics).toEqual(b.metrics)
    expect(a.reliability).toEqual(b.reliability)
  })
})
