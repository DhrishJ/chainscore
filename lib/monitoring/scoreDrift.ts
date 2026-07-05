// Score drift monitoring (Workstream F, adversarial robustness). Pure
// functions, no I/O. These are the math primitives for detecting when the
// live score distribution shifts abruptly relative to the training-time
// distribution, and for flagging cohorts of new wallets that converge on
// high scores (a farming signal). Wiring to live telemetry happens later.

// Floor applied to each bucket share before taking a log in the PSI
// calculation, so empty buckets do not produce -Infinity / NaN.
const PSI_SHARE_FLOOR = 1e-4

// Conventional PSI cutoffs: below 0.1 is stable, 0.1-0.25 is a moderate
// shift worth watching, above 0.25 is a severe shift.
const PSI_MODERATE_CUTOFF = 0.1
const PSI_SEVERE_CUTOFF = 0.25

const DEFAULT_HIGH_SCORE_MIN = 700
const DEFAULT_MAX_AGE_DAYS = 90

export interface ModelMetaDistribution {
  score_distribution: Record<string, number>
  score_band: {
    score_min: number
    score_max: number
  }
}

// Builds the 11 bucket edges used to bin scores into deciles: the model's
// floor, its p10..p90 anchors (in order), and its ceiling. The resulting
// array defines 10 buckets, edges[i] to edges[i + 1].
export function decileBucketsFromMeta(meta: ModelMetaDistribution): number[] {
  const deciles = [10, 20, 30, 40, 50, 60, 70, 80, 90]
  const anchors = deciles.map((d) => {
    const key = `p${d}`
    const value = meta.score_distribution[key]
    if (typeof value !== 'number') {
      throw new Error(`score_distribution is missing required key "${key}"`)
    }
    return value
  })
  return [meta.score_band.score_min, ...anchors, meta.score_band.score_max]
}

// Fraction of scores falling into each of the buckets defined by edges
// (edges.length - 1 buckets). Buckets are left-inclusive/right-exclusive
// except the final bucket, which is right-inclusive so a score exactly at
// the top edge is still counted. Scores outside [edges[0], edges[last]] are
// ignored (they cannot occur for a well-formed score, and clamping them
// silently would mask a real data problem).
export function bucketShares(scores: number[], edges: number[]): number[] {
  const bucketCount = edges.length - 1
  const counts = new Array<number>(bucketCount).fill(0)
  if (scores.length === 0) return counts

  for (const score of scores) {
    for (let i = 0; i < bucketCount; i++) {
      const lo = edges[i]
      const hi = edges[i + 1]
      const isLastBucket = i === bucketCount - 1
      const inBucket = isLastBucket ? score >= lo && score <= hi : score >= lo && score < hi
      if (inBucket) {
        counts[i] += 1
        break
      }
    }
  }

  const total = scores.length
  return counts.map((c) => c / total)
}

// Population Stability Index between an expected (baseline / training-time)
// share distribution and an observed (live) one. Each share is clamped to a
// floor of PSI_SHARE_FLOOR before the log so empty buckets contribute a
// large but finite penalty instead of Infinity/NaN.
export function populationStabilityIndex(expectedShares: number[], observedShares: number[]): number {
  if (expectedShares.length !== observedShares.length) {
    throw new Error(
      `expectedShares and observedShares must have the same length (got ${expectedShares.length} and ${observedShares.length})`,
    )
  }

  let psi = 0
  for (let i = 0; i < expectedShares.length; i++) {
    const expected = Math.max(expectedShares[i], PSI_SHARE_FLOOR)
    const observed = Math.max(observedShares[i], PSI_SHARE_FLOOR)
    psi += (observed - expected) * Math.log(observed / expected)
  }
  return psi
}

// Classifies a PSI value using the conventional risk-modeling cutoffs:
// under 0.1 is stable, 0.1 to 0.25 is a moderate shift, above 0.25 is
// severe.
export function driftVerdict(psi: number): 'stable' | 'moderate' | 'severe' {
  if (psi >= PSI_SEVERE_CUTOFF) return 'severe'
  if (psi >= PSI_MODERATE_CUTOFF) return 'moderate'
  return 'stable'
}

export interface HighScoreConvergenceOptions {
  // Minimum score to count as "high". Defaults to 700.
  scoreMin?: number
  // Maximum wallet age (in days) to count as "young". Defaults to 90.
  maxAgeDays?: number
}

export interface HighScoreConvergenceResult {
  // Fraction of the sample that is both young and high-scoring.
  share: number
  // Sample size the share was computed over.
  n: number
}

// Fraction of a sample that is both a young wallet (walletAgeDays <=
// maxAgeDays) and high-scoring (score >= scoreMin). A large share here is
// the farming signal: many brand-new wallets converging on high scores.
export function highScoreConvergence(
  input: Array<{ score: number; walletAgeDays: number }>,
  opts?: HighScoreConvergenceOptions,
): HighScoreConvergenceResult {
  const scoreMin = opts?.scoreMin ?? DEFAULT_HIGH_SCORE_MIN
  const maxAgeDays = opts?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS
  const n = input.length

  if (n === 0) return { share: 0, n: 0 }

  let matches = 0
  for (const item of input) {
    if (item.walletAgeDays <= maxAgeDays && item.score >= scoreMin) matches += 1
  }
  return { share: matches / n, n }
}
