import { describe, expect, it } from 'vitest'
import modelMeta from '@/ml/model_meta.json'
import {
  GRADE_CUTOFFS,
  gradeForScore,
  stylesForGrade,
  tierForGrade,
  tierForScore,
} from '@/lib/site/scoreTier'

describe('score tier system (Phase 6 design tokens)', () => {
  it('grade cutoffs are pinned to ml/model_meta.json', () => {
    expect(GRADE_CUTOFFS).toEqual((modelMeta as { grade_cutoffs: unknown }).grade_cutoffs)
  })

  it('grades follow the cutoffs at the boundaries', () => {
    expect(gradeForScore(850)).toBe('A')
    expect(gradeForScore(774)).toBe('A')
    expect(gradeForScore(773)).toBe('B')
    expect(gradeForScore(643)).toBe('B')
    expect(gradeForScore(642)).toBe('C')
    expect(gradeForScore(578)).toBe('C')
    expect(gradeForScore(577)).toBe('D')
    expect(gradeForScore(452)).toBe('D')
    expect(gradeForScore(451)).toBe('F')
    expect(gradeForScore(300)).toBe('F')
  })

  it('tiers map grades A/B/CD/F to excellent/good/fair/poor', () => {
    expect(tierForGrade('A')).toBe('excellent')
    expect(tierForGrade('B')).toBe('good')
    expect(tierForGrade('C')).toBe('fair')
    expect(tierForGrade('D')).toBe('fair')
    expect(tierForGrade('F')).toBe('poor')
    expect(tierForGrade('junk')).toBe('poor')
    expect(tierForScore(800)).toBe('excellent')
    expect(tierForScore(300)).toBe('poor')
  })

  it('every tier style is a static class string (purge-safe)', () => {
    for (const grade of ['A', 'B', 'C', 'F']) {
      const s = stylesForGrade(grade)
      for (const cls of [s.pill, s.text, s.dot, s.bar]) {
        expect(cls).toMatch(/^[a-z0-9/ :-]+$/i)
        expect(cls).not.toContain('${')
      }
    }
  })
})
