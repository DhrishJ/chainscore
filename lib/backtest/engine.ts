import { predictFromFeatureVector } from '@/lib/data/mlScorer'
import {
  Sample,
  baseRateWeights,
  brier,
  ece,
  operatingPoint,
  prAuc,
  reliabilityBins,
  rocAuc,
  OperatingPoint,
  ReliabilityBin,
} from './metrics'

// Point-in-time backtest engine (Workstream C).
//
// Contract: for every row, the features must have been observable at or
// before the row's asOf, and the outcome window must start at or after the
// asOf. The engine REFUSES to score anything that violates either bound
// (LookaheadError), which is what the zero-lookahead test exercises. Scoring
// runs through the exact serving path (predictFromFeatureVector), so a
// backtest validates the deployed model artifact, not a Python re-creation.

export class LookaheadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LookaheadError'
  }
}

export interface BacktestRow {
  address: string
  chain: string
  // The moment the score is hypothetically issued.
  asOfTs: number
  // When the newest data inside the feature vector was observed.
  featuresValidAtTs: number
  // When the forward outcome window opens.
  outcomeWindowStartTs: number
  features: number[]
  label: 0 | 1
  walletAgeDays: number
  totalBorrows: number
}

export interface BacktestOptions {
  // Reweight metrics to this base rate (true population prevalence).
  targetBaseRate?: number
  // Flag wallets with score below this cutoff (the D/F operating point).
  scoreCutoff: number
}

export interface SliceMetrics {
  n: number
  positives: number
  rocAuc: number
  prAuc: number
}

export interface BacktestReport {
  modelVersion: string
  generatedAt: string
  nRows: number
  positives: number
  sampleBaseRate: number
  targetBaseRate: number | null
  metrics: {
    rocAuc: number
    prAuc: number
    brier: number
    ece: number
  }
  reliability: ReliabilityBin[]
  operatingPoint: OperatingPoint & { scoreCutoff: number }
  slices: Record<string, SliceMetrics>
}

interface ScoredRow extends BacktestRow {
  pd: number
  score: number
}

function sliceKeysFor(row: BacktestRow): string[] {
  return [
    `chain=${row.chain}`,
    row.walletAgeDays < 180 ? 'age<180d' : 'age>=180d',
    row.totalBorrows <= 3 ? 'borrows<=3' : 'borrows>3',
  ]
}

function toSamples(rows: ScoredRow[], weights: number[]): Sample[] {
  return rows.map((r, i) => ({ p: r.pd, label: r.label, weight: weights[i] }))
}

export function runBacktest(rows: BacktestRow[], opts: BacktestOptions): BacktestReport {
  if (rows.length === 0) throw new Error('backtest requires at least one row')

  // Zero-lookahead enforcement. Both violations fail loudly; a backtest that
  // silently used future data would be worse than no backtest.
  for (const row of rows) {
    if (row.featuresValidAtTs > row.asOfTs) {
      throw new LookaheadError(
        `features for ${row.address} (${row.chain}) observed at ${row.featuresValidAtTs}, after as_of ${row.asOfTs}`
      )
    }
    if (row.outcomeWindowStartTs < row.asOfTs) {
      throw new LookaheadError(
        `outcome window for ${row.address} (${row.chain}) opens at ${row.outcomeWindowStartTs}, before as_of ${row.asOfTs}`
      )
    }
  }

  let modelVersion = 'unknown'
  const scored: ScoredRow[] = rows.map((row) => {
    const pred = predictFromFeatureVector(row.features)
    if (!pred) throw new Error('model artifacts unavailable; cannot backtest')
    modelVersion = pred.modelVersion
    return { ...row, pd: pred.pd, score: pred.score }
  })

  const labels = scored.map((r) => r.label)
  const weights =
    opts.targetBaseRate !== undefined ? baseRateWeights(labels, opts.targetBaseRate) : labels.map(() => 1)

  const samples = toSamples(scored, weights)
  const op = operatingPoint(
    samples,
    scored.map((r) => r.score < opts.scoreCutoff),
    opts.scoreCutoff
  )

  const slices: Record<string, SliceMetrics> = {}
  const sliceBuckets = new Map<string, { rows: ScoredRow[]; weights: number[] }>()
  scored.forEach((row, i) => {
    for (const key of sliceKeysFor(row)) {
      const bucket = sliceBuckets.get(key) ?? { rows: [], weights: [] }
      bucket.rows.push(row)
      bucket.weights.push(weights[i])
      sliceBuckets.set(key, bucket)
    }
  })
  for (const [key, bucket] of [...sliceBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const s = toSamples(bucket.rows, bucket.weights)
    slices[key] = {
      n: bucket.rows.length,
      positives: bucket.rows.filter((r) => r.label === 1).length,
      rocAuc: rocAuc(s),
      prAuc: prAuc(s),
    }
  }

  const positives = labels.reduce<number>((s, l) => s + l, 0)
  return {
    modelVersion,
    generatedAt: new Date().toISOString(),
    nRows: rows.length,
    positives,
    sampleBaseRate: positives / rows.length,
    targetBaseRate: opts.targetBaseRate ?? null,
    metrics: {
      rocAuc: rocAuc(samples),
      prAuc: prAuc(samples),
      brier: brier(samples),
      ece: ece(samples),
    },
    reliability: reliabilityBins(samples),
    operatingPoint: { ...op, scoreCutoff: opts.scoreCutoff },
    slices,
  }
}
