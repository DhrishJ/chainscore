// Dependency-free sliding-window rate limiter, safe for Edge middleware
// (plain Map, numbers, Date.now — no Node-only APIs).
//
// This is per-instance in-memory state: on serverless/edge deployments each
// isolate/instance gets its own Map, state resets whenever an instance is
// recycled, and separate instances do not coordinate with each other. That
// makes this best-effort abuse damping, not a strict quota. A durable shared
// store (for example Upstash Redis) is the planned upgrade for a real quota.

interface Bucket {
  // Timestamps (ms) of requests still inside the current window, oldest first.
  hits: number[]
  // Last time this bucket was touched, used for LRU-ish eviction.
  lastSeen: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface RateLimiterOptions {
  windowMs: number
  max: number
}

// Cap on the number of distinct keys tracked at once. Once exceeded, the
// oldest (least recently seen) entries are evicted to keep memory bounded.
const MAX_TRACKED_KEYS = 10000

export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, max } = options
  const buckets = new Map<string, Bucket>()

  function evictOldestIfNeeded() {
    if (buckets.size <= MAX_TRACKED_KEYS) return
    // Map preserves insertion order, but we want least-recently-seen, so
    // re-insert keys on access (see limit()) to keep that order meaningful.
    const overflow = buckets.size - MAX_TRACKED_KEYS
    const keys = buckets.keys()
    for (let i = 0; i < overflow; i++) {
      const next = keys.next()
      if (next.done) break
      buckets.delete(next.value)
    }
  }

  function limit(key: string): RateLimitResult {
    const now = Date.now()
    let bucket = buckets.get(key)

    if (bucket) {
      // Refresh recency by re-inserting so it moves to the "newest" end.
      buckets.delete(key)
    } else {
      bucket = { hits: [], lastSeen: now }
    }

    const windowStart = now - windowMs
    bucket.hits = bucket.hits.filter((t) => t > windowStart)
    bucket.lastSeen = now

    if (bucket.hits.length >= max) {
      buckets.set(key, bucket)
      evictOldestIfNeeded()
      const oldestHit = bucket.hits[0]
      const retryAfterMs = Math.max(0, oldestHit + windowMs - now)
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      }
    }

    bucket.hits.push(now)
    buckets.set(key, bucket)
    evictOldestIfNeeded()

    return {
      allowed: true,
      remaining: max - bucket.hits.length,
      retryAfterSeconds: 0,
    }
  }

  return { limit }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>
