import { describe, expect, it } from 'vitest'
import {
  CHAIN_COVERAGE,
  FACTOR_GROUPS,
  HERO_STATS,
  METHODOLOGY,
} from '@/lib/site/publicFacts'
import { validateContent, type FactRecord } from '@/lib/facts/validator'
import { FACTS } from '@/scripts/seedFacts'
import modelMeta from '@/ml/model_meta.json'
import coverage from '@/lib/data/coverage.generated.json'

// Drift enforcement (G3): the landing page renders from lib/site/publicFacts,
// and these tests pin that module to the model, the coverage registry, and
// the Facts Registry seed. A number or name that drifts fails CI.

const registryFacts: FactRecord[] = FACTS.map((f) => ({
  key: f.key,
  value: f.value,
  numericValue: f.numericValue,
  unit: f.unit,
  verified: f.verified,
}))

describe('publicFacts: factor groups mirror the model', () => {
  it('names match ml/model_meta.json factor_groups exactly, in order', () => {
    const modelGroups = Object.keys(
      (modelMeta as { factor_groups: Record<string, string[]> }).factor_groups
    )
    expect(FACTOR_GROUPS.map((g) => g.name)).toEqual(modelGroups)
  })
})

describe('publicFacts: chain coverage mirrors the generated registry', () => {
  it('EVM chains match lib/data/coverage.generated.json exactly', () => {
    const registryChains = [
      ...new Set(
        (coverage as { deployments: Array<{ chain: string }> }).deployments.map((d) => d.chain)
      ),
    ].sort()
    const siteEvmChains = CHAIN_COVERAGE.filter((c) => c.status !== 'separate')
      .map((c) => c.slug)
      .sort()
    expect(siteEvmChains).toEqual(registryChains)
  })

  it('degraded chains are exactly scroll and avalanche; solana is separate', () => {
    expect(
      CHAIN_COVERAGE.filter((c) => c.status === 'degraded').map((c) => c.slug).sort()
    ).toEqual(['avalanche', 'scroll'])
    expect(CHAIN_COVERAGE.filter((c) => c.status === 'separate').map((c) => c.slug)).toEqual([
      'solana',
    ])
  })
})

describe('publicFacts: every stat is registry-backed and validator-clean', () => {
  const allStats = [...HERO_STATS, ...METHODOLOGY]

  it('every registryKey names a VERIFIED seed fact', () => {
    for (const stat of allStats) {
      if (!stat.registryKey) continue
      const fact = FACTS.find((f) => f.key === stat.registryKey)
      expect(fact, `missing fact ${stat.registryKey}`).toBeTruthy()
      expect(fact?.verified, `${stat.registryKey} is not verified`).toBe(true)
    }
  })

  it('every rendered stat line passes the pre-publish validator', () => {
    for (const stat of allStats) {
      const rendered = `${stat.value} ${stat.label}`
      const result = validateContent(rendered, registryFacts)
      expect(result.ok, `validator rejected "${rendered}": ${JSON.stringify(result.violations)}`).toBe(
        true
      )
    }
  })

  it('the retired 25K+ events claim would still be blocked', () => {
    expect(validateContent('Liquidation records: 25K+ events', registryFacts).ok).toBe(false)
  })

  it('the old dishonest hero line would still be blocked as a unit', () => {
    // "8 Networks covered" flat: the 8 is verified only with the caveat
    // attached; the validator allows the digit, so this asserts the copy
    // module simply does not contain the flat phrasing anywhere.
    const flat = allStats.some((s) => /networks covered/i.test(s.label) && s.value.trim() === '8')
    expect(flat).toBe(false)
  })
})
