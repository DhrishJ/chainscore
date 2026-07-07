// The semantic score-tier system (Phase 6 design tokens). One mapping from
// grade/score to tier, one set of class strings per tier, used by every
// badge, pill, bar, and gauge. Before this, five components each carried
// their own slightly different grade-color logic; now a tier change is one
// edit. Class strings are static literals so Tailwind's purge sees them.
//
// Grade cutoffs mirror ml/model_meta.json grade_cutoffs and are pinned by
// tests/unit/scoreTier.test.ts, same drift-proofing pattern as publicFacts.

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'
export type ScoreTier = 'excellent' | 'good' | 'fair' | 'poor'

export const GRADE_CUTOFFS: Record<Exclude<Grade, 'F'>, number> = {
  A: 774,
  B: 643,
  C: 578,
  D: 452,
}

export function gradeForScore(score: number): Grade {
  if (score >= GRADE_CUTOFFS.A) return 'A'
  if (score >= GRADE_CUTOFFS.B) return 'B'
  if (score >= GRADE_CUTOFFS.C) return 'C'
  if (score >= GRADE_CUTOFFS.D) return 'D'
  return 'F'
}

export function tierForGrade(grade: string): ScoreTier {
  switch (grade) {
    case 'A':
      return 'excellent'
    case 'B':
      return 'good'
    case 'C':
    case 'D':
      return 'fair'
    default:
      return 'poor'
  }
}

export function tierForScore(score: number): ScoreTier {
  return tierForGrade(gradeForScore(score))
}

export interface TierStyles {
  // Pill/badge: border + tinted bg + colored text (AA on dark; on light
  // surfaces pair `dot` with text-text instead, see CoverageBadge pattern).
  pill: string
  text: string
  dot: string
  // Progress/gauge fill.
  bar: string
}

const STYLES: Record<ScoreTier, TierStyles> = {
  excellent: {
    pill: 'text-accent border-accent/30 bg-accent/10',
    text: 'text-accent',
    dot: 'bg-accent',
    bar: 'bg-gradient-to-r from-accent to-success',
  },
  good: {
    pill: 'text-success border-success/30 bg-success/10',
    text: 'text-success',
    dot: 'bg-success',
    bar: 'bg-gradient-to-r from-success to-accent',
  },
  fair: {
    pill: 'text-warning border-warning/30 bg-warning/10',
    text: 'text-warning',
    dot: 'bg-warning',
    bar: 'bg-warning',
  },
  poor: {
    pill: 'text-danger border-danger/30 bg-danger/10',
    text: 'text-danger',
    dot: 'bg-danger',
    bar: 'bg-danger',
  },
}

export function tierStyles(tier: ScoreTier): TierStyles {
  return STYLES[tier]
}

export function stylesForGrade(grade: string): TierStyles {
  return STYLES[tierForGrade(grade)]
}

export function stylesForScore(score: number): TierStyles {
  return STYLES[tierForScore(score)]
}
