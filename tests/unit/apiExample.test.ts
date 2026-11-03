import { describe, expect, it } from 'vitest'
import openapi from '@/public/openapi.json'
import { FEATURE_SET_VERSION as SERVICE_FEATURE_SET, SCORING_API_VERSION as SERVICE_API } from '@/lib/scoring/service'
import {
  EXAMPLE_SCORE,
  FEATURE_SET_VERSION,
  SCORING_API_VERSION,
  consoleTabs,
  formatJson,
  scoredEnvelope,
} from '@/lib/site/apiExample'
import { MODEL_VERSION, pdForScore, percentileForScore } from '@/lib/site/modelFacts'
import { gradeForScore } from '@/lib/site/scoreTier'

// The home page's API console must show a response the API could actually
// send: every field the OpenAPI contract requires, values consistent with
// the model, and version constants that match the scoring service.

const schemas = (openapi as { components: { schemas: Record<string, { required?: string[] }> } }).components.schemas

describe('apiExample: the scored envelope honours the contract', () => {
  it('carries every required ScoreEnvelope field', () => {
    const env = scoredEnvelope()
    for (const key of schemas.ScoreEnvelope.required ?? []) {
      expect(env, `missing ${key}`).toHaveProperty(key)
    }
  })

  it('every factor carries the required Factor fields', () => {
    for (const f of scoredEnvelope().factors) {
      for (const key of schemas.Factor.required ?? []) expect(f, `factor missing ${key}`).toHaveProperty(key)
      expect(f.weightedScore).toBeCloseTo(f.rawScore * f.weight, 2)
    }
  })

  it('integrity carries the required Integrity fields', () => {
    const env = scoredEnvelope()
    for (const key of schemas.Integrity.required ?? []) expect(env.integrity).toHaveProperty(key)
  })

  it('values follow the model', () => {
    const env = scoredEnvelope()
    expect(env.score).toBe(EXAMPLE_SCORE)
    expect(env.grade).toBe(gradeForScore(EXAMPLE_SCORE))
    expect(env.percentile).toBe(percentileForScore(EXAMPLE_SCORE))
    expect(env.calibratedPD).toBeCloseTo(pdForScore(EXAMPLE_SCORE), 4)
    expect(env.modelVersion).toBe(MODEL_VERSION)
  })

  it('version constants mirror the scoring service', () => {
    expect(SCORING_API_VERSION).toBe(SERVICE_API)
    expect(FEATURE_SET_VERSION).toBe(SERVICE_FEATURE_SET)
  })
})

describe('apiExample: console formatting', () => {
  it('formatJson output parses back to the same value', () => {
    const env = scoredEnvelope()
    expect(JSON.parse(formatJson(env))).toEqual(env)
  })

  it('the no-history example parses after its comment line and flags the branch', () => {
    const tab = consoleTabs().find((t) => t.id === 'no-history')
    expect(tab).toBeTruthy()
    const json = tab!.code.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    const parsed = JSON.parse(json)
    expect(parsed.noBorrowHistory).toBe(true)
    expect(parsed.score).toBe(0)
  })

  it('no rendered example uses an em dash (house style)', () => {
    for (const t of consoleTabs()) expect(t.code).not.toContain('\u2014')
  })
})
