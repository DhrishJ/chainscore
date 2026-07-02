import { describe, expect, it } from 'vitest'
import { createMemoryFeatureStore } from '@/lib/featureStore'

const V = 'v5'

describe('feature store point-in-time reads', () => {
  it('returns the latest snapshot at or before the as_of', async () => {
    const store = createMemoryFeatureStore()
    await store.put({ address: '0xa', chain: 'ethereum', validAtTs: 100, featureSetVersion: V, features: [1], dataCompleteness: 1 })
    await store.put({ address: '0xa', chain: 'ethereum', validAtTs: 200, featureSetVersion: V, features: [2], dataCompleteness: 1 })
    await store.put({ address: '0xa', chain: 'ethereum', validAtTs: 300, featureSetVersion: V, features: [3], dataCompleteness: 1 })

    const at250 = await store.getAsOf('0xa', 'ethereum', 250, V)
    expect(at250?.features).toEqual([2])
    const at300 = await store.getAsOf('0xa', 'ethereum', 300, V)
    expect(at300?.features).toEqual([3])
  })

  it('NEVER returns a snapshot from after the as_of', async () => {
    const store = createMemoryFeatureStore()
    await store.put({ address: '0xa', chain: 'ethereum', validAtTs: 500, featureSetVersion: V, features: [9], dataCompleteness: 1 })
    expect(await store.getAsOf('0xa', 'ethereum', 499, V)).toBeNull()
  })

  it('isolates chains, addresses, and feature set versions', async () => {
    const store = createMemoryFeatureStore()
    await store.put({ address: '0xa', chain: 'ethereum', validAtTs: 100, featureSetVersion: V, features: [1], dataCompleteness: 1 })
    expect(await store.getAsOf('0xa', 'arbitrum', 200, V)).toBeNull()
    expect(await store.getAsOf('0xb', 'ethereum', 200, V)).toBeNull()
    expect(await store.getAsOf('0xa', 'ethereum', 200, 'v4')).toBeNull()
  })

  it('upserts on the natural key instead of duplicating', async () => {
    const store = createMemoryFeatureStore()
    await store.put({ address: '0xa', chain: 'ethereum', validAtTs: 100, featureSetVersion: V, features: [1], dataCompleteness: 0.8 })
    await store.put({ address: '0xa', chain: 'ethereum', validAtTs: 100, featureSetVersion: V, features: [1.5], dataCompleteness: 1 })
    const row = await store.getAsOf('0xa', 'ethereum', 100, V)
    expect(row?.features).toEqual([1.5])
    expect(row?.dataCompleteness).toBe(1)
  })
})
