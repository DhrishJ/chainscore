// Score cache with stale-while-known semantics (Workstream E).
//
// Per-instance in-memory cache. On serverless each instance keeps its own
// cache, so this is a latency optimization, not a coordinated store; a shared
// cache (Upstash/Redis) is the planned upgrade, same tradeoff as the rate
// limiter (DECISIONS.md D-013). What it guarantees regardless of deployment:
// a fresh entry is served directly, a stale entry is served with a stale flag
// and its original as_of, and the cache never invents a score.

export interface CacheEntry<T> {
  value: T
  computedAtMs: number
}

export interface CacheReadResult<T> {
  value: T
  stale: boolean
  ageMs: number
}

export interface ScoreCacheOptions {
  freshMs: number
  // Entries older than freshMs but younger than maxAgeMs are returned with a
  // stale flag (still useful under provider outage). Older than maxAgeMs is a
  // miss.
  maxAgeMs: number
  maxEntries?: number
}

export class ScoreCache<T> {
  private store = new Map<string, CacheEntry<T>>()

  constructor(private readonly opts: ScoreCacheOptions) {}

  private prune(): void {
    const cap = this.opts.maxEntries ?? 10_000
    if (this.store.size <= cap) return
    // Map preserves insertion order; drop the oldest until under cap.
    const excess = this.store.size - cap
    let i = 0
    for (const key of this.store.keys()) {
      if (i++ >= excess) break
      this.store.delete(key)
    }
  }

  get(key: string, now = Date.now()): CacheReadResult<T> | null {
    const entry = this.store.get(key)
    if (!entry) return null
    const ageMs = now - entry.computedAtMs
    if (ageMs > this.opts.maxAgeMs) {
      this.store.delete(key)
      return null
    }
    return { value: entry.value, stale: ageMs > this.opts.freshMs, ageMs }
  }

  set(key: string, value: T, now = Date.now()): void {
    // Re-insert at the end for LRU-ish ordering.
    this.store.delete(key)
    this.store.set(key, { value, computedAtMs: now })
    this.prune()
  }

  // Explicit invalidation on new activity (event-driven path).
  invalidate(key: string): void {
    this.store.delete(key)
  }

  // Return a stale entry even past maxAgeMs, for graceful degradation when a
  // fresh compute fails and last-known-good is better than an error.
  getLastKnownGood(key: string, now = Date.now()): CacheReadResult<T> | null {
    const entry = this.store.get(key)
    if (!entry) return null
    return { value: entry.value, stale: true, ageMs: now - entry.computedAtMs }
  }

  get size(): number {
    return this.store.size
  }
}
