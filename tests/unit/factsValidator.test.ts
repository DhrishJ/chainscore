import { describe, expect, it } from 'vitest'
import { extractNumericClaims, validateContent, type FactRecord } from '@/lib/facts/validator'

// Mirror of the seeded registry state relevant to these tests.
const FACTS: FactRecord[] = [
  { key: 'score_min', value: '300', numericValue: 300, unit: 'score', verified: true },
  { key: 'score_max', value: '850', numericValue: 850, unit: 'score', verified: true },
  { key: 'backtest_wallets', value: '7,720', numericValue: 7720, unit: 'wallets', verified: true },
  { key: 'backtest_roc_auc', value: '0.849', numericValue: 0.8489, unit: 'auc', verified: true },
  {
    key: 'backtest_recall_operating',
    value: '88%',
    numericValue: 0.8815,
    unit: 'ratio',
    verified: true,
  },
  {
    key: 'liquidated_wallets_unique',
    value: '20,717',
    numericValue: 20717,
    unit: 'wallets',
    verified: true,
  },
  // The contested site claim: registered but NOT verified.
  {
    key: 'claim_250k_borrowers_analyzed',
    value: '250K+',
    numericValue: 250000,
    unit: 'wallets',
    verified: false,
  },
]

describe('extractNumericClaims', () => {
  it('parses formatted numbers, suffixes, bounds, and percents', () => {
    const claims = extractNumericClaims('We analyzed 250K+ borrowers with 88% recall on 7,720 wallets (ROC 0.849)')
    const raws = claims.map((c) => [c.magnitude, c.isLowerBound, c.isPercent])
    expect(raws).toContainEqual([250000, true, false])
    expect(raws).toContainEqual([88, false, true])
    expect(raws).toContainEqual([7720, false, false])
    expect(raws).toContainEqual([0.849, false, false])
  })

  it('ignores URLs, code spans, bare years, and version tokens', () => {
    const claims = extractNumericClaims(
      'Since 2024, v5 ships. See https://chainscore.dev/score/0x123?tab=2 and `limit(60)`'
    )
    expect(claims).toHaveLength(0)
  })
})

describe('validateContent', () => {
  it('BLOCKS the inflated site claim: 250K+ borrowers analyzed (unverified entry)', () => {
    const result = validateContent('ChainScore has analyzed 250K+ borrowers onchain.', FACTS)
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].claim).toContain('250K')
  })

  it('BLOCKS a fabricated number with no registry entry at all', () => {
    const result = validateContent('Over 1M wallets scored this month!', FACTS)
    expect(result.ok).toBe(false)
  })

  it('passes verified claims exactly as registered', () => {
    const result = validateContent(
      'Backtested on 7,720 wallets: 88% recall, ROC-AUC 0.849. Scores range 300 to 850.',
      FACTS
    )
    expect(result.ok).toBe(true)
    expect(result.claims.length).toBeGreaterThanOrEqual(5)
  })

  it('passes honest lower bounds backed by a verified fact', () => {
    // 20K+ backed by liquidated_wallets_unique = 20,717
    expect(validateContent('Built from 20K+ liquidated wallets.', FACTS).ok).toBe(true)
  })

  it('blocks lower bounds that overstate the verified fact', () => {
    // 25K+ exceeds every verified wallet-count fact except backtest-unrelated ones
    expect(validateContent('Built from 25K+ liquidated wallets.', FACTS).ok).toBe(false)
  })

  it('blocks a percent claim that rounds wrong', () => {
    expect(validateContent('We catch 92% of liquidations.', FACTS).ok).toBe(false)
  })

  it('passes content with no numbers at all', () => {
    expect(validateContent('Onchain credit scoring without the paperwork.', FACTS).ok).toBe(true)
  })
})
