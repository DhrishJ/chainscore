import { describe, expect, it } from 'vitest'
import {
  bucketShares,
  decileBucketsFromMeta,
  driftVerdict,
  highScoreConvergence,
  populationStabilityIndex,
  type ModelMetaDistribution,
} from '@/lib/monitoring/scoreDrift'

describe('decileBucketsFromMeta', () => {
  it('builds the 11 edges from score_min, p10..p90, score_max in order', () => {
    const meta: ModelMetaDistribution = {
      score_distribution: {
        median: 608,
        p10: 350,
        p20: 475,
        p30: 543,
        p40: 578,
        p50: 608,
        p60: 628,
        p70: 659,
        p80: 711,
        p90: 800,
      },
      score_band: { score_min: 300, score_max: 850 },
    }

    expect(decileBucketsFromMeta(meta)).toEqual([300, 350, 475, 543, 578, 608, 628, 659, 711, 800, 850])
  })

  it('throws when a required decile key is missing', () => {
    const meta = {
      score_distribution: { p10: 350 },
      score_band: { score_min: 300, score_max: 850 },
    } as unknown as ModelMetaDistribution

    expect(() => decileBucketsFromMeta(meta)).toThrow()
  })
})

describe('bucketShares', () => {
  it('returns an array of zeros for empty input', () => {
    const edges = [0, 10, 20, 30]
    expect(bucketShares([], edges)).toEqual([0, 0, 0])
  })

  it('bins scores with the last bucket right-inclusive, others right-exclusive', () => {
    const edges = [0, 10, 20, 30]
    // bucket0 = [0,10): 5, 0 -> 2
    // bucket1 = [10,20): 15, 10 -> 2
    // bucket2 = [20,30]: 25, 20, 30 -> 3
    const scores = [5, 15, 25, 10, 20, 30, 0]
    const shares = bucketShares(scores, edges)
    expect(shares).toEqual([2 / 7, 2 / 7, 3 / 7])
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('matches hand-built decile-style buckets', () => {
    const edges = [300, 350, 475, 543, 578, 608, 628, 659, 711, 800, 850]
    const scores = [300, 349, 350, 500, 578, 850, 800, 810]
    // 300 -> [300,350) bucket0
    // 349 -> bucket0
    // 350 -> [350,475) bucket1
    // 500 -> [475,543) bucket2
    // 578 -> [578,608) bucket4 (right-exclusive; 578 is the lower edge)
    // 850 -> last bucket [800,850] inclusive
    // 800 -> last bucket lower edge -> [711,800) is bucket8, 800 falls in bucket9 [800,850]
    // 810 -> last bucket
    const shares = bucketShares(scores, edges)
    expect(shares[0]).toBeCloseTo(2 / 8)
    expect(shares[1]).toBeCloseTo(1 / 8)
    expect(shares[2]).toBeCloseTo(1 / 8)
    expect(shares[4]).toBeCloseTo(1 / 8)
    expect(shares[9]).toBeCloseTo(3 / 8)
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})

describe('populationStabilityIndex', () => {
  it('is 0 for identical distributions', () => {
    const shares = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
    expect(populationStabilityIndex(shares, shares)).toBe(0)
  })

  it('handles empty buckets on both sides without blowing up', () => {
    const expected = [1, 0]
    const observed = [1, 0]
    expect(populationStabilityIndex(expected, observed)).toBe(0)
  })

  it('handles an empty bucket on only one side using the floor instead of Infinity/NaN', () => {
    const expected = [0.5, 0.5, 0]
    const observed = [0.4, 0.4, 0.2]
    const psi = populationStabilityIndex(expected, observed)
    expect(Number.isFinite(psi)).toBe(true)
    expect(psi).toBeGreaterThan(0)
  })

  it('is large for a severe shift (mass moves entirely into one bucket)', () => {
    const expected = new Array(10).fill(0.1)
    const observed = new Array(10).fill(0)
    observed[9] = 1
    const psi = populationStabilityIndex(expected, observed)
    expect(psi).toBeGreaterThan(0.25)
    expect(driftVerdict(psi)).toBe('severe')
  })

  it('throws on length mismatch', () => {
    expect(() => populationStabilityIndex([0.5, 0.5], [0.3, 0.3, 0.4])).toThrow()
  })
})

describe('driftVerdict', () => {
  it('classifies below 0.1 as stable', () => {
    expect(driftVerdict(0)).toBe('stable')
    expect(driftVerdict(0.05)).toBe('stable')
  })

  it('classifies 0.1 to just under 0.25 as moderate', () => {
    expect(driftVerdict(0.1)).toBe('moderate')
    expect(driftVerdict(0.2)).toBe('moderate')
  })

  it('classifies 0.25 and above as severe', () => {
    expect(driftVerdict(0.25)).toBe('severe')
    expect(driftVerdict(1)).toBe('severe')
  })
})

describe('highScoreConvergence', () => {
  it('computes the share of young, high-scoring wallets on a mixed fixture', () => {
    const input = [
      { score: 720, walletAgeDays: 10 }, // young + high -> match
      { score: 650, walletAgeDays: 5 }, // young + low -> no
      { score: 800, walletAgeDays: 200 }, // old + high -> no
      { score: 400, walletAgeDays: 300 }, // old + low -> no
      { score: 700, walletAgeDays: 90 }, // boundary: young and high -> match
      { score: 699, walletAgeDays: 90 }, // boundary: young but just under high -> no
    ]

    const result = highScoreConvergence(input)
    expect(result.n).toBe(6)
    expect(result.share).toBeCloseTo(2 / 6)
  })

  it('respects custom scoreMin and maxAgeDays options', () => {
    const input = [
      { score: 760, walletAgeDays: 20 },
      { score: 760, walletAgeDays: 40 },
      { score: 720, walletAgeDays: 20 },
    ]

    const result = highScoreConvergence(input, { scoreMin: 750, maxAgeDays: 30 })
    expect(result.n).toBe(3)
    expect(result.share).toBeCloseTo(1 / 3)
  })

  it('returns share 0 and n 0 for an empty sample', () => {
    expect(highScoreConvergence([])).toEqual({ share: 0, n: 0 })
  })
})
