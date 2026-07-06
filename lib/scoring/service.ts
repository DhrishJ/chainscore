import type { ScoreResult } from '@/types'
import type { TxRecord } from '@/lib/ingest/types'
import { assessIntegrity, applyIntegrityPenalty } from '@/lib/integrity/detectors'
import type { LendingEvent, IntegrityAssessment } from '@/lib/integrity/types'
import { ScoreCache } from './cache'
import { sharedCacheDelete, sharedCacheGet, sharedCachePut } from './cacheDurable'

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
const FRESH_MS = 5 * 60 * 1000
const MAX_AGE_MS = 60 * 60 * 1000
const scoreCache = new ScoreCache<ScoreEnvelope>({
  freshMs: FRESH_MS,
  maxAgeMs: MAX_AGE_MS,
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

// ---- Shared (cross-instance) cache layer, D-018 ----
//
// Same semantics as the sync functions above, with Upstash Redis as an L2
// under the in-memory L1. When Redis credentials are absent (dev, CI) these
// behave identically to their sync counterparts. Callers on the live scoring
// path use these; the sync functions stay for tests and non-async contexts.

export async function getCachedEnvelopeShared(
  address: string,
  chain: string
): Promise<ScoreEnvelope | null> {
  const key = cacheKey(address, chain)
  const l1 = scoreCache.get(key)
  if (l1 && !(l1.ageMs > FRESH_MS)) {
    return { ...l1.value, cached: true, stale: false }
  }
  const l2 = await sharedCacheGet(key)
  if (l2) {
    const ageMs = Date.now() - l2.computedAtMs
    if (ageMs <= MAX_AGE_MS) {
      // Hydrate L1 preserving the original compute time so staleness keeps
      // aging correctly on this instance.
      scoreCache.set(key, l2.envelope, l2.computedAtMs)
      return { ...l2.envelope, cached: true, stale: ageMs > FRESH_MS }
    }
  }
  if (l1) return { ...l1.value, cached: true, stale: l1.stale }
  return null
}

export async function putEnvelopeShared(envelope: ScoreEnvelope): Promise<void> {
  const key = cacheKey(envelope.address, envelope.chain)
  const now = Date.now()
  scoreCache.set(key, envelope, now)
  sharedCachePut(key, envelope, now)
}

export async function invalidateScoreShared(address: string, chain: string): Promise<void> {
  const key = cacheKey(address, chain)
  scoreCache.invalidate(key)
  sharedCacheDelete(key)
}

export async function getLastKnownGoodShared(
  address: string,
  chain: string
): Promise<ScoreEnvelope | null> {
  const key = cacheKey(address, chain)
  const l1 = scoreCache.getLastKnownGood(key)
  if (l1) return { ...l1.value, cached: true, stale: true }
  const l2 = await sharedCacheGet(key)
  if (l2) return { ...l2.envelope, cached: true, stale: true }
  return null
}
