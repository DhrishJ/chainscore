import { env } from '@/lib/env.server'
import type { ScoreEnvelope } from './service'

// Shared (cross-instance) score-cache layer on Upstash Redis REST, resolving
// D-018. Layered UNDER the in-memory ScoreCache in service.ts: the memory
// cache stays the fast L1, Redis is the L2 that makes a score computed on one
// serverless instance visible to every other. Same posture as the durable
// rate limiter (D-031): fetch-only, short timeout, fail-open — a Redis outage
// degrades to exactly the per-instance behavior the app had before.
//
// Entries persist LKG_TTL_SECONDS so the last-known-good fallback works
// across instances too; freshness/staleness is judged by the caller from
// computedAtMs, not by Redis expiry.

const LKG_TTL_SECONDS = 7 * 24 * 60 * 60
const TIMEOUT_MS = 500

export interface SharedCacheEntry {
  envelope: ScoreEnvelope
  computedAtMs: number
}

const restUrl = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL ?? env.Chainscore_KV_REST_API_URL
const restToken =
  env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN ?? env.Chainscore_KV_REST_API_TOKEN

export function sharedCacheEnabled(): boolean {
  return Boolean(restUrl && restToken)
}

function redisKey(cacheKey: string): string {
  return `score:${cacheKey}`
}

async function command(cmd: (string | number)[]): Promise<unknown> {
  if (!restUrl || !restToken) return null
  const base = restUrl.replace(/\/+$/, '')
  const response = await fetch(`${base}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${restToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd.map(String)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`upstash http ${response.status}`)
  const parsed = (await response.json()) as { result?: unknown; error?: string }
  if (parsed.error) throw new Error(parsed.error)
  return parsed.result ?? null
}

export async function sharedCacheGet(cacheKey: string): Promise<SharedCacheEntry | null> {
  if (!sharedCacheEnabled()) return null
  try {
    const raw = await command(['GET', redisKey(cacheKey)])
    if (typeof raw !== 'string' || raw.length === 0) return null
    const parsed = JSON.parse(raw) as SharedCacheEntry
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.computedAtMs !== 'number' ||
      typeof parsed.envelope !== 'object' ||
      parsed.envelope === null
    ) {
      return null
    }
    return parsed
  } catch (e) {
    console.error(`[score-cache] shared read failed (${e instanceof Error ? e.name : 'error'})`)
    return null
  }
}

// Fire-and-forget: never let a cache write add latency or failure to the
// scoring path.
export function sharedCachePut(cacheKey: string, envelope: ScoreEnvelope, computedAtMs: number): void {
  if (!sharedCacheEnabled()) return
  const entry: SharedCacheEntry = { envelope, computedAtMs }
  void command(['SET', redisKey(cacheKey), JSON.stringify(entry), 'EX', LKG_TTL_SECONDS]).catch(
    (e) => console.error(`[score-cache] shared write failed (${e instanceof Error ? e.name : 'error'})`)
  )
}

export function sharedCacheDelete(cacheKey: string): void {
  if (!sharedCacheEnabled()) return
  void command(['DEL', redisKey(cacheKey)]).catch((e) =>
    console.error(`[score-cache] shared delete failed (${e instanceof Error ? e.name : 'error'})`)
  )
}
