import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDurableRateLimiter, decide, windowKey } from '@/lib/rateLimitDurable'

const CONFIG = {
  restUrl: 'https://fake.upstash.io',
  restToken: 'token',
  windowMs: 60_000,
  max: 3,
  prefix: 'test',
}

function mockPipeline(incrResult: unknown, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => [{ result: incrResult }, { result: 1 }],
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('decide', () => {
  it('allows under the limit and counts down remaining', () => {
    const result = decide({ count: 1, windowEndsAtMs: 60_000 }, 3, 0)
    expect(result).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 })
  })

  it('allows exactly at the limit with zero remaining', () => {
    const result = decide({ count: 3, windowEndsAtMs: 60_000 }, 3, 0)
    expect(result).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 })
  })

  it('denies over the limit with retry-after to the window end', () => {
    const result = decide({ count: 4, windowEndsAtMs: 60_000 }, 3, 15_000)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBe(45)
  })

  it('never returns a retry-after below one second', () => {
    const result = decide({ count: 4, windowEndsAtMs: 60_000 }, 3, 59_999)
    expect(result.retryAfterSeconds).toBe(1)
  })
})

describe('windowKey', () => {
  it('buckets timestamps into fixed windows', () => {
    expect(windowKey('p', 'k', 60_000, 0)).toBe('rl:p:k:0')
    expect(windowKey('p', 'k', 60_000, 59_999)).toBe('rl:p:k:0')
    expect(windowKey('p', 'k', 60_000, 60_000)).toBe('rl:p:k:1')
  })

  it('separates prefixes and keys', () => {
    expect(windowKey('a', 'k', 60_000, 0)).not.toBe(windowKey('b', 'k', 60_000, 0))
    expect(windowKey('a', 'k1', 60_000, 0)).not.toBe(windowKey('a', 'k2', 60_000, 0))
  })
})

describe('createDurableRateLimiter', () => {
  it('allows when the pipeline INCR is under the max', async () => {
    vi.stubGlobal('fetch', mockPipeline(2))
    const limiter = createDurableRateLimiter(CONFIG)
    const result = await limiter.limit('1.2.3.4')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)
  })

  it('denies when the pipeline INCR exceeds the max', async () => {
    vi.stubGlobal('fetch', mockPipeline(4))
    const limiter = createDurableRateLimiter(CONFIG)
    const result = await limiter.limit('1.2.3.4')
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it('fails open on http errors', async () => {
    vi.stubGlobal('fetch', mockPipeline(0, 500))
    const limiter = createDurableRateLimiter(CONFIG)
    const result = await limiter.limit('1.2.3.4')
    expect(result.allowed).toBe(true)
  })

  it('fails open when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      })
    )
    const limiter = createDurableRateLimiter(CONFIG)
    const result = await limiter.limit('1.2.3.4')
    expect(result.allowed).toBe(true)
  })

  it('fails open on malformed replies', async () => {
    vi.stubGlobal('fetch', mockPipeline('not-a-number'))
    const limiter = createDurableRateLimiter(CONFIG)
    const result = await limiter.limit('1.2.3.4')
    expect(result.allowed).toBe(true)
  })

  it('sends INCR and PEXPIRE NX for the window key', async () => {
    const fetchMock = mockPipeline(1)
    vi.stubGlobal('fetch', fetchMock)
    const limiter = createDurableRateLimiter(CONFIG)
    await limiter.limit('1.2.3.4')
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://fake.upstash.io/pipeline')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body[0][0]).toBe('INCR')
    expect(body[1][0]).toBe('PEXPIRE')
    expect(body[1][3]).toBe('NX')
    expect(body[0][1]).toMatch(/^rl:test:1\.2\.3\.4:\d+$/)
  })
})
