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
  // Counterparty addresses, lowercased. Optional because not every source
  // exposes them the same way; consumers (entity resolution, wash-trade
  // detection) must treat their absence as "unknown", not "no counterparty".
  from?: string
  // Lowercased; empty string for contract-creation transactions (no `to`).
  to?: string
  // Etherscan-compatible txlist: raw transfer value in wei as a decimal
  // string, taken verbatim from the API's `value` field (exact, no floating
  // point involved).
  valueWei?: string
  // Alchemy getAssetTransfers: `value` comes back as an ETH float (or null),
  // not wei. Kept as a separate field rather than converted to a wei string,
  // since a float-to-wei conversion would either lose precision or fabricate
  // precision the source never had.
  valueEth?: number
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
