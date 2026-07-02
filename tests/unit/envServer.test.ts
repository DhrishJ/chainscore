import { afterEach, describe, expect, it, vi } from 'vitest'

const FULL_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
  ETHERSCAN_API_KEY: 'test-etherscan',
  ALCHEMY_API_KEY: 'test-alchemy',
  THEGRAPH_API_KEY: 'test-thegraph',
  HELIUS_API_KEY: 'test-helius',
}

function stubAll(overrides: Record<string, string | undefined> = {}) {
  const merged = { ...FULL_ENV, ...overrides }
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) vi.stubEnv(key, '')
    else vi.stubEnv(key, value)
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('lib/env.server', () => {
  it('parses a complete environment', async () => {
    stubAll()
    const { env } = await import('@/lib/env.server')
    expect(env.ETHERSCAN_API_KEY).toBe('test-etherscan')
    expect(env.NODE_ENV).toBe('test')
  })

  it('throws loudly when a required variable is missing', async () => {
    stubAll({ ALCHEMY_API_KEY: undefined })
    await expect(import('@/lib/env.server')).rejects.toThrow(/ALCHEMY_API_KEY/)
  })

  it('never includes secret values in the error message', async () => {
    stubAll({ ETHERSCAN_API_KEY: undefined })
    try {
      await import('@/lib/env.server')
      expect.unreachable('import should have thrown')
    } catch (e) {
      const message = String(e)
      expect(message).not.toContain(FULL_ENV.DATABASE_URL)
      expect(message).not.toContain(FULL_ENV.ALCHEMY_API_KEY)
    }
  })
})
