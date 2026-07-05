import { describe, expect, it, beforeEach } from 'vitest'
import { ScoreCache } from '@/lib/scoring/cache'
import {
  buildEnvelope,
  getCachedEnvelope,
  putEnvelope,
  invalidateScore,
  getLastKnownGood,
} from '@/lib/scoring/service'
import type { ScoreResult } from '@/types'
import type { TxRecord } from '@/lib/ingest/types'

function scoredBorrower(over: Partial<ScoreResult> = {}): ScoreResult {
  return {
    address: '0xabc0000000000000000000000000000000000001',
    ens: null,
    score: 720,
    grade: 'A',
    percentile: 80,
    factors: [],
    walletAge: 800,
    totalTxns: 400,
    protocolsUsed: ['Aave'],
    timestamp: Date.now(),
    newWallet: false,
    modelVersion: 'v5-xgb-cal',
    calibratedPD: 0.02,
    dataCompleteness: 1,
    degradedSources: [],
    ...over,
  }
}

describe('ScoreCache', () => {
  it('serves a fresh entry directly', () => {
    const cache = new ScoreCache<number>({ freshMs: 1000, maxAgeMs: 5000 })
    cache.set('k', 42, 0)
    const hit = cache.get('k', 500)
    expect(hit?.value).toBe(42)
    expect(hit?.stale).toBe(false)
  })

  it('flags an entry stale past freshMs but within maxAge', () => {
    const cache = new ScoreCache<number>({ freshMs: 1000, maxAgeMs: 5000 })
    cache.set('k', 42, 0)
    expect(cache.get('k', 2000)?.stale).toBe(true)
  })

  it('misses past maxAge', () => {
    const cache = new ScoreCache<number>({ freshMs: 1000, maxAgeMs: 5000 })
    cache.set('k', 42, 0)
    expect(cache.get('k', 6000)).toBeNull()
  })

  it('returns last-known-good even past maxAge', () => {
    const cache = new ScoreCache<number>({ freshMs: 1000, maxAgeMs: 5000 })
    cache.set('k', 42, 0)
    const lkg = cache.getLastKnownGood('k', 999999)
    expect(lkg?.value).toBe(42)
    expect(lkg?.stale).toBe(true)
  })

  it('prunes to the entry cap', () => {
    const cache = new ScoreCache<number>({ freshMs: 1000, maxAgeMs: 5000, maxEntries: 3 })
    for (let i = 0; i < 10; i++) cache.set(`k${i}`, i)
    expect(cache.size).toBeLessThanOrEqual(3)
  })
})

describe('buildEnvelope', () => {
  it('carries model provenance and versioning', () => {
    const env = buildEnvelope(scoredBorrower(), 'ethereum')
    expect(env.modelVersion).toBe('v5-xgb-cal')
    expect(env.featureSetVersion).toBe('v5')
    expect(env.apiVersion).toBe('v1')
    expect(env.score).toBe(720)
    expect(env.modelScore).toBe(720)
    expect(env.asOf).toBeTruthy()
  })

  it('applies an integrity penalty from wash-trading records', () => {
    // Reciprocal loop between the wallet and one counterparty.
    const self = '0xabc0000000000000000000000000000000000001'
    const cp = '0xdef0000000000000000000000000000000000002'
    const txs: TxRecord[] = []
    for (let i = 0; i < 10; i++) {
      txs.push({ hash: `0x${i}a`, timeStamp: 1_700_000_000 + i * 3600, from: self, to: cp })
      txs.push({ hash: `0x${i}b`, timeStamp: 1_700_000_000 + i * 3600 + 60, from: cp, to: self })
    }
    const env = buildEnvelope(scoredBorrower(), 'ethereum', { txs, relatedAddresses: [cp] })
    expect(env.integrity.penalty).toBeGreaterThan(0)
    expect(env.score).toBeLessThan(env.modelScore)
  })

  it('never penalizes a new wallet', () => {
    const env = buildEnvelope(scoredBorrower({ newWallet: true, score: 300 }), 'ethereum', { txs: [] })
    expect(env.integrity.penalty).toBe(0)
    expect(env.score).toBe(300)
  })

  it('never penalizes a no-borrow-history wallet', () => {
    const env = buildEnvelope(scoredBorrower({ noBorrowHistory: true, score: 0 }), 'ethereum', { txs: [] })
    expect(env.integrity.penalty).toBe(0)
  })
})

describe('service cache lifecycle', () => {
  const addr = '0xcache000000000000000000000000000000000009'

  beforeEach(() => invalidateScore(addr, 'ethereum'))

  it('round-trips an envelope through put and get with cached flag', () => {
    const env = buildEnvelope(scoredBorrower({ address: addr }), 'ethereum')
    putEnvelope(env)
    const got = getCachedEnvelope(addr, 'ethereum')
    expect(got?.cached).toBe(true)
    expect(got?.score).toBe(env.score)
  })

  it('invalidation drops the entry', () => {
    putEnvelope(buildEnvelope(scoredBorrower({ address: addr }), 'ethereum'))
    invalidateScore(addr, 'ethereum')
    expect(getCachedEnvelope(addr, 'ethereum')).toBeNull()
  })

  it('last-known-good survives for graceful degradation', () => {
    putEnvelope(buildEnvelope(scoredBorrower({ address: addr }), 'ethereum'))
    const lkg = getLastKnownGood(addr, 'ethereum')
    expect(lkg?.stale).toBe(true)
  })
})
