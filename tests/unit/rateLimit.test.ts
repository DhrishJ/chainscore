import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRateLimiter } from '@/lib/rateLimit'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('lib/rateLimit', () => {
  it('allows requests under the max within the window', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 })

    const r1 = limiter.limit('a')
    const r2 = limiter.limit('a')
    const r3 = limiter.limit('a')

    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('enforces the max, rejecting requests once the limit is hit', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 })

    limiter.limit('a')
    limiter.limit('a')
    const third = limiter.limit('a')

    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
  })

  it('rolls the window over so old hits expire and allow new requests', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 })

    limiter.limit('a')
    limiter.limit('a')
    expect(limiter.limit('a').allowed).toBe(false)

    // Advance past the window entirely.
    vi.advanceTimersByTime(1001)

    const afterRollover = limiter.limit('a')
    expect(afterRollover.allowed).toBe(true)
    expect(afterRollover.remaining).toBe(1)
  })

  it('reports a sane retryAfterSeconds bounded by the window', () => {
    const limiter = createRateLimiter({ windowMs: 10_000, max: 1 })

    limiter.limit('a')
    // Move partway through the window before hitting the limit again.
    vi.advanceTimersByTime(4000)
    const blocked = limiter.limit('a')

    expect(blocked.allowed).toBe(false)
    // Oldest hit expires at t=10000, we're at t=4000, so ~6 seconds left.
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(10)
  })

  it('isolates rate limit state per key', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 })

    const a1 = limiter.limit('a')
    const b1 = limiter.limit('b')
    const a2 = limiter.limit('a')

    expect(a1.allowed).toBe(true)
    expect(b1.allowed).toBe(true)
    expect(a2.allowed).toBe(false)
  })

  it('prunes tracked keys so the map does not grow unbounded', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 100 })

    // Push well past the internal 10000-key cap.
    for (let i = 0; i < 10_500; i++) {
      limiter.limit(`key-${i}`)
    }

    // The earliest keys should have been evicted, so they behave as fresh
    // (allowed with a full remaining budget minus this one hit) rather than
    // carrying forward any prior state.
    const evictedKeyResult = limiter.limit('key-0')
    expect(evictedKeyResult.allowed).toBe(true)
    expect(evictedKeyResult.remaining).toBe(99)

    // A very recently seen key should still be tracked and reflect its
    // accumulated hit.
    const recentKeyResult = limiter.limit('key-10499')
    expect(recentKeyResult.allowed).toBe(true)
    expect(recentKeyResult.remaining).toBe(98)
  })
})
