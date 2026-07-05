import { TxRecord } from '@/lib/ingest/types'

// Manipulation detection (Workstream F). Detectors consume enriched
// transaction history (TxRecord with from/to/value) plus lending events and
// emit graded signals. Signals combine into a single risk penalty that
// downstream scoring applies, so a partly-gamed wallet is discounted in
// proportion to the evidence rather than trusted or hard-blocked.

export type DetectorId =
  | 'wash_trading'
  | 'sybil_funding'
  | 'burst_timing'
  | 'instant_repay'

export interface DetectorSignal {
  id: DetectorId
  // 0 = no evidence, 1 = maximal evidence. Graded, never boolean.
  severity: number
  // Human-readable so an analyst (and the explainability UI) can see why.
  reason: string
  // Supporting counts for audit.
  evidence: Record<string, number>
}

export interface WalletActivity {
  address: string
  chain: string
  txs: TxRecord[]
  // Lending events, if known, for the repayment-timing detector.
  lendingEvents?: LendingEvent[]
  // Wallets known to share a funding source with this one (from the entity
  // resolver). Absence means "unknown", not "none".
  relatedAddresses?: string[]
}

export interface LendingEvent {
  kind: 'borrow' | 'repay'
  timeStamp: number
  // Same-tx borrow+repay, or repay in the immediately following block, is
  // the flash-shaped signature.
  blockNumber?: number
  amountWei?: string
}

// The penalty applied to the score, derived from all signals.
export interface IntegrityAssessment {
  signals: DetectorSignal[]
  // 0 = clean, 1 = maximal penalty. Downstream scoring maps this to a score
  // reduction; it never silently zeroes a score.
  penalty: number
  // Convenience flags for UI and logs; do not gate scoring on these alone.
  flagged: boolean
}
