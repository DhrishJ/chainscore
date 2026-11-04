// Can this wallet be judged at all? (D-042)
//
// The model's two gates read absence as a verdict: no transactions means
// "new wallet", no borrows means "no borrowing history". That is only true
// when the sources actually answered. If every transaction-history source
// failed, or every lending deployment covering the chain failed, an empty
// reading is an outage, not a fact about the wallet, and saying "never
// borrowed" would be false. Callers must report the outage instead.

export interface LendingOutcome {
  deployments?: number
  answered?: number
}

export interface ReadabilityInput {
  // Both transaction-history lookups (first tx and history) failed.
  firstTxError?: string
  historyError?: string
  lending: LendingOutcome[]
}

export type Readability =
  | { ok: true }
  | { ok: false; reason: 'history' | 'lending'; message: string }

export function assessReadability({ firstTxError, historyError, lending }: ReadabilityInput): Readability {
  if (firstTxError && historyError) {
    return {
      ok: false,
      reason: 'history',
      message: "Could not read this wallet's transaction history from any provider.",
    }
  }
  const deployments = lending.reduce((n, l) => n + (l.deployments ?? 0), 0)
  const answered = lending.reduce((n, l) => n + (l.answered ?? 0), 0)
  if (deployments > 0 && answered === 0) {
    return {
      ok: false,
      reason: 'lending',
      message: "Could not read this wallet's lending history: none of the protocol subgraphs answered.",
    }
  }
  return { ok: true }
}
