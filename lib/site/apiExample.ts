// The API examples on the home page. The scored response is a complete
// ScoreEnvelope (every field public/openapi.json marks required, pinned by
// tests/unit/apiExample.test.ts) for an illustrative wallet, with PD,
// grade, and percentile computed from the real model band and deciles.

import { gradeForScore } from '@/lib/site/scoreTier'
import { MODEL_VERSION, pdForScore, percentileForScore } from '@/lib/site/modelFacts'

// Mirrors of lib/scoring/service.ts constants (importing the service would
// drag its cache and integrity stack into the page). Pinned by test.
export const SCORING_API_VERSION = 'v1'
export const FEATURE_SET_VERSION = 'v5'

export const EXAMPLE_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
export const EXAMPLE_SCORE = 742
const AS_OF = '2026-11-03T14:08:00.000Z'

const FACTORS = [
  {
    name: 'Lending History',
    rawScore: 91,
    weight: 0.3,
    explanation:
      'Active on both Compound (3 loans) and Aave (11 loans). Repayment track record drives this signal.',
  },
  {
    name: 'Wallet History',
    rawScore: 84,
    weight: 0.25,
    explanation: '412 transactions, active across 10 of the last 12 months. Older, steadily active wallets score higher.',
  },
  {
    name: 'DeFi Activity',
    rawScore: 72,
    weight: 0.23,
    explanation: 'Active across 3 protocol(s): Aave, Compound, Uniswap. Uniswap LP detected.',
  },
  {
    name: 'Portfolio & Identity',
    rawScore: 79,
    weight: 0.22,
    explanation: 'ENS name registered. ETH holdings detected.',
  },
].map((f) => ({ ...f, weightedScore: Math.round(f.rawScore * f.weight * 100) / 100, limitedData: false }))

export function scoredEnvelope() {
  return {
    apiVersion: SCORING_API_VERSION,
    address: EXAMPLE_ADDRESS,
    chain: 'ethereum',
    score: EXAMPLE_SCORE,
    grade: gradeForScore(EXAMPLE_SCORE),
    percentile: percentileForScore(EXAMPLE_SCORE),
    modelScore: EXAMPLE_SCORE,
    modelVersion: MODEL_VERSION,
    featureSetVersion: FEATURE_SET_VERSION,
    calibratedPD: Math.round(pdForScore(EXAMPLE_SCORE) * 10000) / 10000,
    factors: FACTORS,
    integrity: { penalty: 0, flagged: false, signals: [] as string[] },
    dataCompleteness: 1,
    degradedSources: [] as string[],
    newWallet: false,
    noBorrowHistory: false,
    asOf: AS_OF,
    computedAt: AS_OF,
    cached: false,
    stale: false,
  }
}

/** JSON with arrays of objects kept one object per line, for reading. */
export function formatJson(value: unknown): string {
  const pad = (n: number) => '  '.repeat(n)
  const fmt = (v: unknown, depth: number): string => {
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]'
      if (v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
        return `[\n${v.map((x) => pad(depth + 1) + JSON.stringify(x).replace(/":/g, '": ').replace(/,"/g, ', "')).join(',\n')}\n${pad(depth)}]`
      }
      return JSON.stringify(v)
    }
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>)
      if (depth > 0 && entries.every(([, x]) => typeof x !== 'object' || x === null || (Array.isArray(x) && x.length === 0))) {
        return `{ ${entries.map(([k, x]) => `"${k}": ${JSON.stringify(x)}`).join(', ')} }`
      }
      return `{\n${entries.map(([k, x]) => `${pad(depth + 1)}"${k}": ${fmt(x, depth + 1)}`).join(',\n')}\n${pad(depth)}}`
    }
    return JSON.stringify(v)
  }
  return fmt(value, 0)
}

export function consoleTabs() {
  const request = [
    `$ curl -s "https://chainscore.dev/api/v1/score/${EXAMPLE_ADDRESS}?chain=ethereum" \\`,
    '    -H "Authorization: Bearer $CHAINSCORE_API_KEY"',
  ].join('\n')

  const noHistory = [
    '// abridged: the fields an underwriter branches on',
    formatJson({
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chain: 'ethereum',
      noBorrowHistory: true,
      newWallet: false,
      score: 0,
      grade: 'F',
      factors: [],
      integrity: { penalty: 0, flagged: false, signals: [] },
    }),
  ].join('\n')

  return [
    { id: 'request', label: 'Request', status: 'GET /api/v1/score', code: request },
    { id: 'scored', label: 'Scored', status: '200 · application/json', code: formatJson(scoredEnvelope()) },
    { id: 'no-history', label: 'Never borrowed', status: '200 · noBorrowHistory', code: noHistory },
  ]
}
