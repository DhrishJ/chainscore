import { describe, expect, it } from 'vitest'
import {
  FLAG_WINDOW,
  GRADE_ORDER,
  SUBDIALS,
  gradeIndex,
  restAngle,
  scoreToAngle,
  type ScaleSpec,
} from '@/lib/instrument/dial'
import { GRADE_CUTOFFS, gradeForScore } from '@/lib/site/scoreTier'
import { BACKTEST, MODEL_VERSION, SCORE_MAX, SCORE_MIN } from '@/lib/site/modelFacts'

// The instrument prints and reads the same numbers as the report: its grade
// window must agree with the grade the API returns, and its scales must map
// readings monotonically onto the dial.

const spec: ScaleSpec = {
  min: SCORE_MIN,
  max: SCORE_MAX,
  grades: GRADE_CUTOFFS,
  cutoff: BACKTEST.cutoff,
  modelVersion: MODEL_VERSION,
}

describe('score instrument dial', () => {
  it('shows the same grade in its window as the report, at every score', () => {
    for (let s = SCORE_MIN; s <= SCORE_MAX; s++) {
      expect(GRADE_ORDER[gradeIndex(s, spec)]).toBe(gradeForScore(s))
    }
  })

  it('sweeps clockwise from the minimum, with the rest stop below it', () => {
    let prev = scoreToAngle(SCORE_MIN, spec)
    for (let s = SCORE_MIN + 10; s <= SCORE_MAX; s += 10) {
      const a = scoreToAngle(s, spec)
      expect(a).toBeLessThan(prev)
      prev = a
    }
    expect(restAngle()).toBeGreaterThan(scoreToAngle(SCORE_MIN, spec))
    // 270 degrees of scale
    expect(scoreToAngle(SCORE_MIN, spec) - scoreToAngle(SCORE_MAX, spec)).toBeCloseTo((Math.PI * 3) / 2, 10)
  })

  it('reads probability of default on a log scale from 0.1% to 50%', () => {
    const pd = SUBDIALS.find((d) => d.key === 'pd')!
    expect(pd.toT(0.001)).toBeCloseTo(0, 10)
    expect(pd.toT(0.5)).toBeCloseTo(1, 10)
    expect(pd.toT(0.0001)).toBe(0) // clamped below the scale
    expect(pd.toT(0.9)).toBe(1) // and above it
    // each decade takes the same arc
    expect(pd.toT(0.1) - pd.toT(0.01)).toBeCloseTo(pd.toT(0.01) - pd.toT(0.001), 10)
    const data = SUBDIALS.find((d) => d.key === 'completeness')!
    expect(data.toT(0)).toBe(0)
    expect(data.toT(1)).toBe(1)
  })

  it('keeps the sub-dials and the window clear of each other and of the numerals', () => {
    const numeralRadius = 0.685 * 0.972 - 0.06 // inner edge of the printed numerals
    for (const sd of SUBDIALS) {
      expect(Math.hypot(sd.x, sd.y) + sd.r).toBeLessThan(numeralRadius)
      // the window's top edge sits below every sub-dial
      expect(FLAG_WINDOW.y + FLAG_WINDOW.h / 2).toBeLessThan(sd.y - sd.r)
    }
    const [a, b] = SUBDIALS
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r)
  })
})
