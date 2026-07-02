// Workstream B: provider abstraction for onchain data ingestion.
//
// Each capability is its own narrow interface so an adapter can implement only
// what its provider actually offers. Phase 1 ships transaction history (the
// single-provider Etherscan dependency); logs, token transfers, and balances
// at block join in Workstream C/E when the feature store needs them.

export interface TxRecord {
  hash: string
  // Unix seconds
  timeStamp: number
}

export interface TxHistorySource {
  // Stable identifier used in logs, completeness reporting, and config.
  readonly name: string
  supportsChain(chainId: number): boolean
  // Oldest transaction timestamp, or null when the wallet has none.
  getFirstTransactionTimestamp(address: string, chainId: number): Promise<number | null>
  // Most recent transactions, newest first, up to `limit`.
  getTransactionList(address: string, chainId: number, limit: number): Promise<TxRecord[]>
}

// Shapes consumed by the scorer. Field-compatible with the historical
// lib/data/etherscan.ts results so the scoring contract does not move.
export interface FirstTxResult {
  timestamp: number | null
  source?: string
  error?: string
}

export interface TxHistoryResult {
  txCount: number
  txCount30d: number
  txCount90d: number
  txCount180d: number
  activeDaysCount: number
  activeMonthsLast12: number
  source?: string
  error?: string
}

export interface AttemptLog {
  source: string
  ok: boolean
  attempts: number
  ms: number
  error?: string
}

export class SourceError extends Error {
  // Retryable errors (429, 5xx, network) are retried with backoff before the
  // failover moves to the next source; non-retryable ones fail over at once.
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'SourceError'
  }
}
