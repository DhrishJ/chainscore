import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The shared cache reads Upstash credentials at module load, so each test
// stubs env and re-imports the module graph.

const ENTRY_ENVELOPE = {
  apiVersion: 'v1',
  address: '0xabc',
  chain: 'ethereum',
  score: 700,
  grade: 'B',
  cached: false,
  stale: false,
} as Record<string, unknown>

function stubUpstashEnv() {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('cacheDurable', () => {
  it('is disabled without credentials and never touches the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const mod = await import('@/lib/scoring/cacheDurable')
    expect(mod.sharedCacheEnabled()).toBe(false)
    expect(await mod.sharedCacheGet('ethereum:0xabc')).toBeNull()
    await mod.sharedCachePut('ethereum:0xabc', ENTRY_ENVELOPE as never, Date.now())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('round-trips an entry through the REST API when enabled', async () => {
    stubUpstashEnv()
    const stored: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const cmd = JSON.parse((init?.body as string) ?? '[]') as string[]
        if (cmd[0] === 'SET') {
          stored[cmd[1]] = cmd[2]
          return { ok: true, status: 200, json: async () => ({ result: 'OK' }) }
        }
        if (cmd[0] === 'GET') {
          return { ok: true, status: 200, json: async () => ({ result: stored[cmd[1]] ?? null }) }
        }
        return { ok: true, status: 200, json: async () => ({ result: null }) }
      }) as unknown as typeof fetch
    )
    const mod = await import('@/lib/scoring/cacheDurable')
    expect(mod.sharedCacheEnabled()).toBe(true)

    const computedAtMs = 1_700_000_000_000
    await mod.sharedCachePut('ethereum:0xabc', ENTRY_ENVELOPE as never, computedAtMs)

    const entry = await mod.sharedCacheGet('ethereum:0xabc')
    expect(entry).not.toBeNull()
    expect(entry?.computedAtMs).toBe(computedAtMs)
    expect((entry?.envelope as unknown as Record<string, unknown>).score).toBe(700)
  })

  it('fails open (null) on network errors', async () => {
    stubUpstashEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }) as unknown as typeof fetch
    )
    const mod = await import('@/lib/scoring/cacheDurable')
    expect(await mod.sharedCacheGet('ethereum:0xabc')).toBeNull()
  })

  it('rejects malformed stored payloads', async () => {
    stubUpstashEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ result: '{"not":"an entry"}' }),
      })) as unknown as typeof fetch
    )
    const mod = await import('@/lib/scoring/cacheDurable')
    expect(await mod.sharedCacheGet('ethereum:0xabc')).toBeNull()
  })
})

describe('service shared cache layer', () => {
  it('hydrates L1 from L2 and flags staleness by age', async () => {
    stubUpstashEnv()
    const computedAtMs = Date.now() - 10 * 60 * 1000 // 10 min old: stale, within max age
    const entry = JSON.stringify({ envelope: { ...ENTRY_ENVELOPE }, computedAtMs })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const cmd = JSON.parse((init?.body as string) ?? '[]') as string[]
      if (cmd[0] === 'GET') return { ok: true, status: 200, json: async () => ({ result: entry }) }
      return { ok: true, status: 200, json: async () => ({ result: 'OK' }) }
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    const service = await import('@/lib/scoring/service')

    const first = await service.getCachedEnvelopeShared('0xABC', 'ethereum')
    expect(first?.cached).toBe(true)
    expect(first?.stale).toBe(true)

    // A stale L1 deliberately re-checks L2 (another instance may have written
    // a fresher score), so the second read still resolves, still stale.
    const second = await service.getCachedEnvelopeShared('0xABC', 'ethereum')
    expect(second?.cached).toBe(true)
    expect(second?.stale).toBe(true)
  })

  it('returns null when both layers miss', async () => {
    stubUpstashEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: null }) })) as unknown as typeof fetch
    )
    const service = await import('@/lib/scoring/service')
    expect(await service.getCachedEnvelopeShared('0xNOPE', 'ethereum')).toBeNull()
  })
})
