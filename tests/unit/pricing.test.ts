import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLANS, estimateOverageUsd, planFor } from '@/lib/pricing/plans'
import { decideQuota, meterScore, usagePeriod, usageRedisKey } from '@/lib/pricing/metering'

afterEach(() => vi.unstubAllGlobals())

describe('plans config', () => {
  it('unknown or missing plan ids resolve to the free tier', () => {
    expect(planFor(undefined).id).toBe('free')
    expect(planFor('nonsense').id).toBe('free')
    expect(planFor('growth').id).toBe('growth')
  })

  it('the free tier has no overage: quota is a hard stop', () => {
    expect(PLANS.free.overagePerScoreUsd).toBeNull()
    expect(estimateOverageUsd(PLANS.free, 5_000)).toBe(0)
  })

  it('overage estimates only count usage beyond quota', () => {
    expect(estimateOverageUsd(PLANS.starter, 9_000)).toBe(0)
    expect(estimateOverageUsd(PLANS.starter, 11_000)).toBeCloseTo(12, 5)
  })
})

describe('decideQuota', () => {
  it('allows inside quota', () => {
    const d = decideQuota(PLANS.starter, 5_000, 50)
    expect(d.allowed).toBe(true)
    expect(d.overageUsd).toBe(0)
  })

  it('free tier stops hard at quota (no surprise bills, no overage)', () => {
    const d = decideQuota(PLANS.free, 1_001, 50)
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('QUOTA_EXCEEDED')
  })

  it('paid tier flows into overage under the customer cap', () => {
    const d = decideQuota(PLANS.starter, 11_000, 50)
    expect(d.allowed).toBe(true)
    expect(d.overageUsd).toBeCloseTo(12, 5)
  })

  it('ACCEPTANCE: the customer-set cap halts overage before a surprise bill', () => {
    // 15,000 scores = 5,000 over quota = $60 estimated overage > $50 cap
    const d = decideQuota(PLANS.starter, 15_000, 50)
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('OVERAGE_CAP_REACHED')
    expect(d.overageUsd).toBeCloseTo(60, 5)
  })

  it('a zero cap means no overage at all beyond quota', () => {
    const d = decideQuota(PLANS.starter, 10_001, 0)
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('OVERAGE_CAP_REACHED')
  })
})

describe('meterScore', () => {
  it('keys usage by hash prefix and calendar month', () => {
    expect(usageRedisKey('abcd1234', '2026-07')).toBe('usage:abcd1234:2026-07')
    expect(usagePeriod(new Date('2026-07-06T12:00:00Z'))).toBe('2026-07')
  })

  it('increments and decides from the post-increment count', async () => {
    vi.stubGlobal('UPSTASH_TEST', true)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
    vi.resetModules()
    const { meterScore: freshMeter } = await import('@/lib/pricing/metering')
    const { PLANS: freshPlans } = await import('@/lib/pricing/plans')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ result: 1_001 }, { result: 1 }],
      })) as unknown as typeof fetch
    )
    const d = await freshMeter('abcd1234', freshPlans.free, 50)
    expect(d.allowed).toBe(false)
    expect(d.used).toBe(1_001)
    vi.unstubAllEnvs()
  })

  it('fails open when Redis is unreachable', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
    vi.resetModules()
    const { meterScore: freshMeter } = await import('@/lib/pricing/metering')
    const { PLANS: freshPlans } = await import('@/lib/pricing/plans')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }) as unknown as typeof fetch
    )
    const d = await freshMeter('abcd1234', freshPlans.free, 50)
    expect(d.allowed).toBe(true)
    vi.unstubAllEnvs()
  })

  it('allows with zero usage when no Redis is configured at all', async () => {
    const d = await meterScore('abcd1234', PLANS.free, 50)
    expect(d.allowed).toBe(true)
    expect(d.used).toBe(0)
  })
})
