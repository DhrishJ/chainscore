import { TxRecord } from '@/lib/ingest/types'
import { DetectorSignal, IntegrityAssessment, LendingEvent, WalletActivity } from './types'

// All detectors are pure functions of a WalletActivity. They never fetch and
// never mutate. Each returns a graded DetectorSignal; combineSignals folds
// them into one penalty. Thresholds are conservative on purpose: a false
// manipulation flag on an honest wallet defames it, so detectors lean toward
// under-flagging and expressing uncertainty through severity rather than a
// hair-trigger boolean.

const DUST_MIN_LOOP = 4 // fewer than this many round-trips is not a pattern

// A1/A2 wash trading: transactions bouncing between the wallet and a small set
// of counterparties (self-dealing loops). Severity scales with the share of
// activity that is reciprocal with related or repeated counterparties.
export function detectWashTrading(activity: WalletActivity): DetectorSignal {
  const self = activity.address.toLowerCase()
  const related = new Set((activity.relatedAddresses ?? []).map((a) => a.toLowerCase()))

  // Count directed edges to/from each counterparty.
  const outTo = new Map<string, number>()
  const inFrom = new Map<string, number>()
  let directed = 0
  for (const tx of activity.txs) {
    if (tx.from === self && tx.to) {
      outTo.set(tx.to, (outTo.get(tx.to) ?? 0) + 1)
      directed++
    } else if (tx.to === self && tx.from) {
      inFrom.set(tx.from, (inFrom.get(tx.from) ?? 0) + 1)
      directed++
    }
  }

  // Reciprocal pairs: a counterparty the wallet both sends to and receives
  // from. Weighted up when the counterparty is a known related address.
  let reciprocalTxs = 0
  const counterparties = new Set([...outTo.keys(), ...inFrom.keys()])
  let reciprocalPartners = 0
  for (const cp of counterparties) {
    const out = outTo.get(cp) ?? 0
    const inc = inFrom.get(cp) ?? 0
    if (out > 0 && inc > 0) {
      const roundTrips = Math.min(out, inc)
      if (roundTrips >= 1) reciprocalPartners++
      reciprocalTxs += (out + inc) * (related.has(cp) ? 1 : 0.6)
    }
  }

  const share = directed > 0 ? Math.min(1, reciprocalTxs / directed) : 0
  // Require both a meaningful share and enough absolute round-trips so a
  // couple of ordinary back-and-forth payments do not trip it.
  const severity = reciprocalPartners >= 1 && reciprocalTxs >= DUST_MIN_LOOP ? share : 0

  return {
    id: 'wash_trading',
    severity,
    reason:
      severity > 0
        ? `${reciprocalPartners} counterparty(ies) in reciprocal loops covering ~${Math.round(share * 100)}% of directed activity`
        : 'no significant self-dealing loops detected',
    evidence: { reciprocalPartners, directed, reciprocalTxsWeighted: Math.round(reciprocalTxs) },
  }
}

// A1/A4 Sybil funding: the wallet is funded from the same source as many
// related addresses, or sits in a tight funding cohort. We approximate with
// the count of related addresses sharing this wallet's earliest funder.
export function detectSybilFunding(activity: WalletActivity): DetectorSignal {
  const self = activity.address.toLowerCase()
  const related = (activity.relatedAddresses ?? []).map((a) => a.toLowerCase())

  // Earliest inbound transfer is the funding event.
  const inbound = activity.txs
    .filter((t) => t.to === self && t.from)
    .sort((a, b) => a.timeStamp - b.timeStamp)
  const funder = inbound[0]?.from

  const cohortSize = related.length
  // Severity grows with cohort size (a lone wallet is not a Sybil signal);
  // saturates around a 10-wallet cohort.
  const severity = funder && cohortSize > 0 ? Math.min(1, cohortSize / 10) : 0

  return {
    id: 'sybil_funding',
    severity,
    reason:
      severity > 0
        ? `funded wallet sits in a related cohort of ${cohortSize}; shared-funding Sybil risk`
        : 'no funding-cohort signal',
    evidence: { cohortSize, hasFunder: funder ? 1 : 0 },
  }
}

// A5 burst timing: activity abnormally concentrated in a short window (for
// example manufactured right before a scoring request). Severity is the share
// of all transactions falling in the densest 7-day window above what uniform
// spreading would predict.
export function detectBurstTiming(activity: WalletActivity, windowDays = 7): DetectorSignal {
  const stamps = activity.txs.map((t) => t.timeStamp).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b)
  if (stamps.length < DUST_MIN_LOOP) {
    return { id: 'burst_timing', severity: 0, reason: 'too few transactions to assess timing', evidence: { n: stamps.length } }
  }
  const span = stamps[stamps.length - 1] - stamps[0]
  const windowSec = windowDays * 86400
  if (span <= windowSec) {
    // The entire history fits in one window: maximally bursty.
    return {
      id: 'burst_timing',
      severity: 1,
      reason: `all ${stamps.length} transactions fall within ${windowDays} days`,
      evidence: { n: stamps.length, spanDays: Math.round(span / 86400) },
    }
  }
  // Sliding window: densest count.
  let maxInWindow = 0
  let j = 0
  for (let i = 0; i < stamps.length; i++) {
    while (stamps[i] - stamps[j] > windowSec) j++
    maxInWindow = Math.max(maxInWindow, i - j + 1)
  }
  const expected = (stamps.length * windowSec) / span // uniform expectation
  const excess = (maxInWindow - expected) / stamps.length
  const severity = Math.max(0, Math.min(1, excess))
  return {
    id: 'burst_timing',
    severity,
    reason:
      severity > 0.2
        ? `${maxInWindow} of ${stamps.length} transactions cluster in a ${windowDays}-day window`
        : 'activity reasonably spread over time',
    evidence: { n: stamps.length, maxInWindow, expected: Math.round(expected) },
  }
}

// A3 instant repay: borrow and repay in the same or immediately following
// block, or a repay matching a borrow within seconds. Fabricates repayment
// history with no real risk carried. Severity is the share of borrows that
// are immediately repaid.
export function detectInstantRepay(activity: WalletActivity): DetectorSignal {
  const events: LendingEvent[] = (activity.lendingEvents ?? []).slice().sort((a, b) => a.timeStamp - b.timeStamp)
  const borrows = events.filter((e) => e.kind === 'borrow')
  if (borrows.length === 0) {
    return { id: 'instant_repay', severity: 0, reason: 'no borrow events', evidence: { borrows: 0 } }
  }
  let instant = 0
  for (const borrow of borrows) {
    const matched = events.find(
      (e) =>
        e.kind === 'repay' &&
        e.timeStamp >= borrow.timeStamp &&
        (e.timeStamp - borrow.timeStamp <= 60 ||
          (borrow.blockNumber !== undefined && e.blockNumber !== undefined && e.blockNumber - borrow.blockNumber <= 1))
    )
    if (matched) instant++
  }
  const severity = instant / borrows.length
  return {
    id: 'instant_repay',
    severity,
    reason:
      severity > 0
        ? `${instant} of ${borrows.length} borrows repaid within one block or 60s (flash-shaped)`
        : 'no instant-repay pattern',
    evidence: { borrows: borrows.length, instant },
  }
}

// Fold all detector signals into one penalty. A soft-OR (probabilistic union)
// so multiple independent signals compound without ever exceeding 1, and no
// single detector can zero a score on its own. Weights reflect how strongly
// each attack undermines the score's meaning.
const DETECTOR_WEIGHTS: Record<string, number> = {
  instant_repay: 1.0, // attacks the strongest positive driver
  wash_trading: 0.8,
  sybil_funding: 0.7,
  burst_timing: 0.5,
}

export function combineSignals(signals: DetectorSignal[]): IntegrityAssessment {
  let survive = 1 // probability that NO signal applies
  for (const s of signals) {
    const w = DETECTOR_WEIGHTS[s.id] ?? 0.5
    survive *= 1 - Math.min(1, Math.max(0, s.severity)) * w
  }
  const penalty = 1 - survive
  return {
    signals,
    penalty,
    flagged: penalty >= 0.5,
  }
}

export function assessIntegrity(activity: WalletActivity): IntegrityAssessment {
  const signals = [
    detectInstantRepay(activity),
    detectWashTrading(activity),
    detectSybilFunding(activity),
    detectBurstTiming(activity),
  ]
  return combineSignals(signals)
}

// Map an integrity penalty to a score reduction. Additive and bounded: the
// penalty can lower a score toward the floor but never below it, and a clean
// wallet (penalty 0) is unchanged. Applied downstream, never inside the model.
export function applyIntegrityPenalty(score: number, assessment: IntegrityAssessment, scoreMin = 300, maxDrop = 250): number {
  const drop = Math.round(assessment.penalty * maxDrop)
  return Math.max(scoreMin, score - drop)
}

export type { TxRecord }
