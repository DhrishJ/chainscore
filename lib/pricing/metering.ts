import { env } from '@/lib/env.server'
import { estimateOverageUsd, type Plan } from './plans'

// Usage metering for the partner API (Section 9). One Redis INCR per scored
// request on a per-key monthly counter, then a pure quota decision:
//
//  - inside quota: allowed
//  - beyond quota, plan has overage pricing: allowed while the estimated
//    overage stays under the customer's hard cap (nobody gets a surprise
//    bill), then QUOTA_EXCEEDED
//  - beyond quota, no overage on the plan (free tier): QUOTA_EXCEEDED
//
// Fail-open on Redis errors, same posture as the rate limiter: metering
// must never be the reason the API is down; a missed count is a smaller
// failure than a false outage.

export interface MeterDecision {
  allowed: boolean
  used: number
  quota: number
  overageUsd: number
  reason?: 'QUOTA_EXCEEDED' | 'OVERAGE_CAP_REACHED'
}

// Pure and unit-tested: given a post-increment count, decide.
export function decideQuota(plan: Plan, used: number, overageCapUsd: number): MeterDecision {
  const base = { used, quota: plan.scoresPerMonth, overageUsd: estimateOverageUsd(plan, used) }
  if (used <= plan.scoresPerMonth) return { allowed: true, ...base }
  if (plan.overagePerScoreUsd === null) {
    return { allowed: false, reason: 'QUOTA_EXCEEDED', ...base }
  }
  if (base.overageUsd > overageCapUsd) {
    return { allowed: false, reason: 'OVERAGE_CAP_REACHED', ...base }
  }
  return { allowed: true, ...base }
}

export function usagePeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7) // YYYY-MM
}

export function usageRedisKey(keyHashPrefix: string, period = usagePeriod()): string {
  return `usage:${keyHashPrefix}:${period}`
}

function redisConfig(): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL ?? env.Chainscore_KV_REST_API_URL
  const token =
    env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN ?? env.Chainscore_KV_REST_API_TOKEN
  return url && token ? { url, token } : null
}

// Counters live ~62 days so the previous period stays readable for billing
// rollups after the month closes.
const USAGE_TTL_SECONDS = 62 * 24 * 60 * 60

export async function meterScore(
  keyHashPrefix: string,
  plan: Plan,
  overageCapUsd: number
): Promise<MeterDecision> {
  const config = redisConfig()
  if (!config) {
    // No Redis: no metering possible; allow and report zero usage.
    return { allowed: true, used: 0, quota: plan.scoresPerMonth, overageUsd: 0 }
  }
  try {
    const key = usageRedisKey(keyHashPrefix)
    const response = await fetch(`${config.url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(USAGE_TTL_SECONDS), 'NX'],
      ]),
      signal: AbortSignal.timeout(1000),
    })
    if (!response.ok) throw new Error(`upstash http ${response.status}`)
    const results = (await response.json()) as Array<{ result?: unknown }>
    const used = typeof results?.[0]?.result === 'number' ? results[0].result : 0
    if (used === 0) throw new Error('unexpected INCR reply')
    return decideQuota(plan, used, overageCapUsd)
  } catch (e) {
    console.error(`[metering] failed open (${e instanceof Error ? e.name : 'error'})`)
    return { allowed: true, used: 0, quota: plan.scoresPerMonth, overageUsd: 0 }
  }
}
