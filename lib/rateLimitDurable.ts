import type { RateLimitResult } from '@/lib/rateLimit'

// Durable fixed-window rate limiter backed by Upstash Redis over REST
// (DECISIONS.md D-013). Edge-safe: fetch only, no Node APIs, no SDK.
//
// Window semantics: one counter per (key, window index). A single pipelined
// INCR + PEXPIRE round trip per check. Fixed windows admit up to 2x max at a
// window boundary in the worst case; that is acceptable for abuse damping
// and costs one round trip instead of the multi-command dance a sliding
// window needs.
//
// Failure semantics: FAIL OPEN. The limiter is protection for the app, not a
// billing meter; if Redis is unreachable the request proceeds and the error
// is logged. Callers who need strict quotas layer them at the route level.

export interface DurableRateLimiterConfig {
  restUrl: string
  restToken: string
  windowMs: number
  max: number
  // Prefix so different buckets (and different deployments) do not collide.
  prefix: string
}

export interface WindowState {
  count: number
  windowEndsAtMs: number
}

// Pure decision logic, unit-testable without a network.
export function decide(state: WindowState, max: number, nowMs: number): RateLimitResult {
  if (state.count > max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((state.windowEndsAtMs - nowMs) / 1000)),
    }
  }
  return {
    allowed: true,
    remaining: Math.max(0, max - state.count),
    retryAfterSeconds: 0,
  }
}

export function windowKey(prefix: string, key: string, windowMs: number, nowMs: number): string {
  const windowIndex = Math.floor(nowMs / windowMs)
  return `rl:${prefix}:${key}:${windowIndex}`
}

export function createDurableRateLimiter(config: DurableRateLimiterConfig) {
  const { restUrl, restToken, windowMs, max, prefix } = config
  const base = restUrl.replace(/\/+$/, '')

  async function limit(key: string): Promise<RateLimitResult> {
    const now = Date.now()
    const redisKey = windowKey(prefix, key, windowMs, now)
    const windowEndsAtMs = (Math.floor(now / windowMs) + 1) * windowMs

    try {
      // Upstash REST pipeline: INCR the window counter, then set its TTL.
      // PEXPIRE NX only sets a TTL when none exists, so only the first hit
      // in a window pays for it and the expiry never slides.
      const response = await fetch(`${base}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${restToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['PEXPIRE', redisKey, String(windowMs * 2), 'NX'],
        ]),
        // A slow limiter must not become the latency floor for every request.
        signal: AbortSignal.timeout(1000),
      })

      if (!response.ok) {
        console.error(`[rate-limit] upstash http ${response.status}; failing open`)
        return { allowed: true, remaining: max, retryAfterSeconds: 0 }
      }

      const results = (await response.json()) as Array<{ result?: unknown; error?: string }>
      const incr = results?.[0]
      if (!incr || typeof incr.result !== 'number') {
        console.error(`[rate-limit] unexpected upstash reply; failing open`)
        return { allowed: true, remaining: max, retryAfterSeconds: 0 }
      }

      return decide({ count: incr.result, windowEndsAtMs }, max, now)
    } catch (e) {
      console.error(
        `[rate-limit] upstash unreachable (${e instanceof Error ? e.name : 'error'}); failing open`
      )
      return { allowed: true, remaining: max, retryAfterSeconds: 0 }
    }
  }

  return { limit }
}

export type DurableRateLimiter = ReturnType<typeof createDurableRateLimiter>
