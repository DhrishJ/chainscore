import type { ScoreResult } from '@/types'
import type { TxRecord } from '@/lib/ingest/types'
import { assessIntegrity, applyIntegrityPenalty } from '@/lib/integrity/detectors'
import type { LendingEvent, IntegrityAssessment } from '@/lib/integrity/types'
import { ScoreCache } from './cache'

// Real-time scoring service (Workstream E). One entry point composes the
// model score, the integrity penalty, versioning, and an as_of stamp into a
// single versioned envelope, and caches it. Determinism contract: given the
// same inputs and the same (modelVersion, featureSetVersion), the envelope is
// reproducible. Every envelope carries what produced it.

export const FEATURE_SET_VERSION = 'v5'
export const SCORING_API_VERSION = 'v1'

export interface ScoreEnvelope {
  apiVersion: string
  address: string
  chain: string
  // Final score after any integrity penalty.
  score: number
  grade: ScoreResult['grade']
  percentile: number
  // The model's score before the integrity penalty, for transparency.
  modelScore: number
  modelVersion: string
  featureSetVersion: string
  calibratedPD?: number
  factors: ScoreResult['factors']
  integrity: {
    penalty: number
    flagged: boolean
    signals: IntegrityAssessment['signals']
  }
  dataCompleteness: number
  degradedSources: string[]
  // States the model already distinguishes, surfaced to API consumers.
  newWallet: boolean
  noBorrowHistory: boolean
  // Provenance and freshness.
  asOf: string
  computedAt: string
  cached: boolean
  stale: boolean
}

export interface IntegrityInputs {
  txs: TxRecord[]
  lendingEvents?: LendingEvent[]
  relatedAddresses?: string[]
}

// Fresh for 5 minutes, usable (stale-flagged) up to 1 hour, the same window as
// the route revalidate. Tunable without touching callers.
const scoreCache = new ScoreCache<ScoreEnvelope>({
  freshMs: 5 * 60 * 1000,
  maxAgeMs: 60 * 60 * 1000,
})

function cacheKey(address: string, chain: string): string {
  return `${chain}:${address.toLowerCase()}`
}

// Build the envelope from an already-computed model result plus optional
// integrity inputs. Pure and synchronous, so it is trivially testable; the
// route does the async data fetch and hands the pieces in.
export function buildEnvelope(
  result: ScoreResult,
  chain: string,
  integrityInputs?: IntegrityInputs
): ScoreEnvelope {
  const now = new Date()
  let finalScore = result.score
  let integrity: ScoreEnvelope['integrity'] = { penalty: 0, flagged: false, signals: [] }

  // Integrity only applies to a real, scored borrower. New and no-history
  // wallets have no behavior to manipulate, so they are never penalized.
  const scorable = !result.newWallet && !result.noBorrowHistory
  if (scorable && integrityInputs) {
    const assessment = assessIntegrity({
      address: result.address,
      chain,
      txs: integrityInputs.txs,
      lendingEvents: integrityInputs.lendingEvents,
      relatedAddresses: integrityInputs.relatedAddresses,
    })
    finalScore = applyIntegrityPenalty(result.score, assessment)
    integrity = { penalty: assessment.penalty, flagged: assessment.flagged, signals: assessment.signals }
  }

  return {
    apiVersion: SCORING_API_VERSION,
    address: result.address,
    chain,
    score: finalScore,
    grade: result.grade,
    percentile: result.percentile,
    modelScore: result.score,
    modelVersion: result.modelVersion ?? 'unknown',
    featureSetVersion: FEATURE_SET_VERSION,
    calibratedPD: result.calibratedPD,
    factors: result.factors,
    integrity,
    dataCompleteness: result.dataCompleteness ?? 1,
    degradedSources: result.degradedSources ?? [],
    newWallet: Boolean(result.newWallet),
    noBorrowHistory: Boolean(result.noBorrowHistory),
    asOf: now.toISOString(),
    computedAt: now.toISOString(),
    cached: false,
    stale: false,
  }
}

export function getCachedEnvelope(address: string, chain: string): ScoreEnvelope | null {
  const hit = scoreCache.get(cacheKey(address, chain))
  if (!hit) return null
  return { ...hit.value, cached: true, stale: hit.stale }
}

export function putEnvelope(envelope: ScoreEnvelope): void {
  scoreCache.set(cacheKey(envelope.address, envelope.chain), envelope)
}

// Explicit invalidation for the event-driven path: new activity on a wallet
// drops its cached score so the next read recomputes.
export function invalidateScore(address: string, chain: string): void {
  scoreCache.invalidate(cacheKey(address, chain))
}

// Graceful degradation: when a fresh compute fails, fall back to the last
// known good envelope (flagged stale) rather than erroring.
export function getLastKnownGood(address: string, chain: string): ScoreEnvelope | null {
  const hit = scoreCache.getLastKnownGood(cacheKey(address, chain))
  if (!hit) return null
  return { ...hit.value, cached: true, stale: true }
}

export function scoreCacheSize(): number {
  return scoreCache.size
}
