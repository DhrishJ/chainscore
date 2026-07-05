// In-process latency benchmark for the scoring service (Workstream E).
//
//   npx tsx scripts/benchScoring.ts
//
// Measures the parts of request latency the service controls: the warm cache
// read and the envelope composition (model score already computed, plus the
// integrity detectors on a realistic tx set). It deliberately excludes the
// provider network fan-out, which dominates a cold request and is not
// something the caching layer can improve. The HTTP harness in
// scripts/loadTest.ts measures end-to-end once a database and API key exist.

import { performance } from 'node:perf_hooks'
import { buildEnvelope, getCachedEnvelope, putEnvelope, invalidateScore } from '@/lib/scoring/service'
import type { ScoreResult } from '@/types'
import type { TxRecord } from '@/lib/ingest/types'

function percentiles(samples: number[]): { p50: number; p95: number; p99: number; max: number } {
  const s = [...samples].sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s[s.length - 1] }
}

function fmt(ms: number): string {
  return `${ms.toFixed(3)}ms`
}

const borrower: ScoreResult = {
  address: '0xbench00000000000000000000000000000000001',
  ens: null,
  score: 710,
  grade: 'A',
  percentile: 79,
  factors: [],
  walletAge: 800,
  totalTxns: 500,
  protocolsUsed: ['Aave'],
  timestamp: Date.now(),
  newWallet: false,
  modelVersion: 'v5-xgb-cal',
  calibratedPD: 0.02,
  dataCompleteness: 1,
  degradedSources: [],
}

// A realistic-sized tx history (500 records) with a wash-trade pattern so the
// detectors do real work, not a trivial empty pass.
function makeTxs(): TxRecord[] {
  const self = borrower.address
  const cp = '0xcounter0000000000000000000000000000000002'
  const txs: TxRecord[] = []
  for (let i = 0; i < 250; i++) {
    txs.push({ hash: `0x${i}a`, timeStamp: 1_700_000_000 + i * 600, from: self, to: cp })
    txs.push({ hash: `0x${i}b`, timeStamp: 1_700_000_000 + i * 600 + 60, from: cp, to: self })
  }
  return txs
}

function bench(label: string, iterations: number, fn: () => void): void {
  // Warm up.
  for (let i = 0; i < 100; i++) fn()
  const samples: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    fn()
    samples.push(performance.now() - t0)
  }
  const p = percentiles(samples)
  console.log(`${label} (n=${iterations})  p50 ${fmt(p.p50)}  p95 ${fmt(p.p95)}  p99 ${fmt(p.p99)}  max ${fmt(p.max)}`)
}

function main(): void {
  const txs = makeTxs()

  // Compose path: build the envelope including integrity on 500 records.
  bench('envelope build + integrity (500 tx)', 5000, () => {
    buildEnvelope(borrower, 'ethereum', { txs, relatedAddresses: ['0xcounter0000000000000000000000000000000002'] })
  })

  // Warm cache path: put once, then measure reads (the sub-second-p95 claim
  // for cached wallets).
  const env = buildEnvelope(borrower, 'ethereum', { txs })
  putEnvelope(env)
  bench('warm cache read', 100000, () => {
    getCachedEnvelope(borrower.address, 'ethereum')
  })

  invalidateScore(borrower.address, 'ethereum')
  console.log('\nNote: cold requests are dominated by provider network latency (seconds), which the cache exists to avoid on repeat reads.')
}

main()
