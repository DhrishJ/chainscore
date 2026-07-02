import { env } from '@/lib/env.server'
import { txHistorySourcesFor } from './config'
import { withFailover } from './failover'
import { FirstTxResult, TxHistoryResult, TxRecord } from './types'

// Resilient replacements for the single-provider lib/data/etherscan.ts
// functions. Same result shapes (the scorer contract does not move), plus a
// `source` field recording which provider answered.

const TX_LIMIT = 10_000

export const EMPTY_HISTORY: Omit<TxHistoryResult, 'source' | 'error'> = {
  txCount: 0,
  txCount30d: 0,
  txCount90d: 0,
  txCount180d: 0,
  activeDaysCount: 0,
  activeMonthsLast12: 0,
}

// Pure aggregation over a transaction list; exported for tests. Reproduces
// the historical etherscan.ts feature definitions exactly.
export function aggregateHistory(txs: TxRecord[], nowSeconds: number): Omit<TxHistoryResult, 'source' | 'error'> {
  const d30 = nowSeconds - 30 * 86400
  const d90 = nowSeconds - 90 * 86400
  const d180 = nowSeconds - 180 * 86400
  const d365 = nowSeconds - 365 * 86400

  let txCount30d = 0
  let txCount90d = 0
  let txCount180d = 0
  const monthSet = new Set<string>()
  const daySet = new Set<string>()

  for (const tx of txs) {
    const ts = tx.timeStamp
    if (Number.isNaN(ts)) continue
    if (ts >= d30) txCount30d++
    if (ts >= d90) txCount90d++
    if (ts >= d180) txCount180d++
    if (ts >= d365) {
      const d = new Date(ts * 1000)
      monthSet.add(`${d.getFullYear()}-${d.getMonth()}`)
    }
    const day = new Date(ts * 1000)
    daySet.add(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`)
  }

  return {
    txCount: txs.length,
    txCount30d,
    txCount90d,
    txCount180d,
    activeDaysCount: daySet.size,
    activeMonthsLast12: monthSet.size,
  }
}

export async function getFirstTransaction(address: string, chainId = 1): Promise<FirstTxResult> {
  try {
    const { value, source } = await withFailover(txHistorySourcesFor(chainId), (s) =>
      s.getFirstTransactionTimestamp(address, chainId)
    )
    return { timestamp: value, source }
  } catch (e) {
    return { timestamp: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function getTransactionHistory(address: string, chainId = 1): Promise<TxHistoryResult> {
  try {
    const { value, source, attempts } = await withFailover(txHistorySourcesFor(chainId), (s) =>
      s.getTransactionList(address, chainId, TX_LIMIT)
    )
    if (attempts.some((a) => !a.ok)) {
      console.warn(
        JSON.stringify({ evt: 'ingest_failover', chainId, winner: source, attempts })
      )
    }
    void maybeReconcile(address, chainId, value.length, source)
    return { ...aggregateHistory(value, Date.now() / 1000), source }
  } catch (e) {
    return { ...EMPTY_HISTORY, error: e instanceof Error ? e.message : String(e) }
  }
}

// Opt-in cross-source reconciliation (INGEST_RECONCILE=true): query the next
// source for the same wallet and log a structured mismatch when tx counts
// disagree by more than 10 percent. Log-only by design; nothing silently
// trusts either side, a human looks at the discrepancy stream.
async function maybeReconcile(address: string, chainId: number, primaryCount: number, primarySource: string): Promise<void> {
  if (env.INGEST_RECONCILE !== 'true') return
  const second = txHistorySourcesFor(chainId).find((s) => s.name !== primarySource && s.supportsChain(chainId))
  if (!second) return
  try {
    const txs = await second.getTransactionList(address, chainId, TX_LIMIT)
    const a = primaryCount
    const b = txs.length
    if (Math.abs(a - b) / Math.max(a, b, 1) > 0.1) {
      console.warn(
        JSON.stringify({
          evt: 'ingest_reconcile_mismatch',
          chainId,
          primary: primarySource,
          secondary: second.name,
          primaryCount: a,
          secondaryCount: b,
        })
      )
    }
  } catch {
    // Reconciliation is best-effort; a secondary failure is not an ingest failure.
  }
}
