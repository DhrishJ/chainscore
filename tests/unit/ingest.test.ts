import { describe, expect, it } from 'vitest'
import { withFailover, AggregateSourceError } from '@/lib/ingest/failover'
import { SourceError, TxHistorySource, TxRecord } from '@/lib/ingest/types'
import { aggregateHistory } from '@/lib/ingest/txHistory'
import { computeCompleteness } from '@/lib/ingest/completeness'
import { txHistorySourcesFor } from '@/lib/ingest/config'

// Fake sources let the failover logic be exercised with zero network access.
function fakeSource(
  name: string,
  behavior: () => Promise<TxRecord[]>
): TxHistorySource & { calls: number } {
  const source = {
    name,
    calls: 0,
    supportsChain: () => true,
    getFirstTransactionTimestamp: async () => null,
    getTransactionList: async () => {
      source.calls++
      return behavior()
    },
  }
  return source
}

const noSleep = () => Promise.resolve()

describe('withFailover', () => {
  it('uses the primary when it succeeds', async () => {
    const primary = fakeSource('primary', async () => [{ hash: '0x1', timeStamp: 1000 }])
    const secondary = fakeSource('secondary', async () => [])
    const result = await withFailover([primary, secondary], (s) => s.getTransactionList('0xabc', 1, 10), {
      sleep: noSleep,
    })
    expect(result.source).toBe('primary')
    expect(result.value).toHaveLength(1)
    expect(secondary.calls).toBe(0)
  })

  it('engages the secondary when the primary is down (outage simulation)', async () => {
    const primary = fakeSource('primary', async () => {
      throw new SourceError('primary HTTP 503', true)
    })
    const secondary = fakeSource('secondary', async () => [{ hash: '0x2', timeStamp: 2000 }])
    const result = await withFailover([primary, secondary], (s) => s.getTransactionList('0xabc', 1, 10), {
      sleep: noSleep,
      retriesPerSource: 2,
    })
    expect(result.source).toBe('secondary')
    expect(primary.calls).toBe(3) // initial try + 2 retries
    expect(result.attempts.filter((a) => !a.ok)).toHaveLength(3)
  })

  it('does not retry non-retryable errors before failing over', async () => {
    const primary = fakeSource('primary', async () => {
      throw new SourceError('unsupported chain', false)
    })
    const secondary = fakeSource('secondary', async () => [])
    const result = await withFailover([primary, secondary], (s) => s.getTransactionList('0xabc', 1, 10), {
      sleep: noSleep,
      retriesPerSource: 2,
    })
    expect(primary.calls).toBe(1)
    expect(result.source).toBe('secondary')
  })

  it('applies exponential backoff between retries', async () => {
    const delays: number[] = []
    const primary = fakeSource('primary', async () => {
      throw new SourceError('rate limited', true)
    })
    const secondary = fakeSource('secondary', async () => [])
    await withFailover([primary, secondary], (s) => s.getTransactionList('0xabc', 1, 10), {
      sleep: (ms) => {
        delays.push(ms)
        return Promise.resolve()
      },
      random: () => 1, // deterministic jitter
      baseBackoffMs: 100,
      retriesPerSource: 2,
    })
    expect(delays).toEqual([100, 200])
  })

  it('throws AggregateSourceError with the full attempt log when everything fails', async () => {
    const primary = fakeSource('a', async () => {
      throw new SourceError('down', true)
    })
    const secondary = fakeSource('b', async () => {
      throw new SourceError('also down', false)
    })
    await expect(
      withFailover([primary, secondary], (s) => s.getTransactionList('0xabc', 1, 10), {
        sleep: noSleep,
        retriesPerSource: 1,
      })
    ).rejects.toThrowError(AggregateSourceError)
  })
})

describe('aggregateHistory', () => {
  const now = 1_750_000_000 // fixed epoch so the test is deterministic

  it('buckets transactions into the trailing windows', () => {
    const day = 86400
    const txs: TxRecord[] = [
      { hash: '0x1', timeStamp: now - 5 * day },
      { hash: '0x2', timeStamp: now - 45 * day },
      { hash: '0x3', timeStamp: now - 100 * day },
      { hash: '0x4', timeStamp: now - 400 * day },
    ]
    const agg = aggregateHistory(txs, now)
    expect(agg.txCount).toBe(4)
    expect(agg.txCount30d).toBe(1)
    expect(agg.txCount90d).toBe(2)
    expect(agg.txCount180d).toBe(3)
    expect(agg.activeDaysCount).toBe(4)
    expect(agg.activeMonthsLast12).toBe(3)
  })

  it('handles an empty list', () => {
    const agg = aggregateHistory([], now)
    expect(agg.txCount).toBe(0)
    expect(agg.activeMonthsLast12).toBe(0)
  })

  it('skips records with unparseable timestamps', () => {
    const agg = aggregateHistory([{ hash: '0x1', timeStamp: NaN }], now)
    expect(agg.txCount).toBe(1) // counted as a tx
    expect(agg.txCount180d).toBe(0) // but not bucketed anywhere
  })
})

describe('computeCompleteness', () => {
  it('reports 1.0 when every source answered', () => {
    expect(computeCompleteness({})).toEqual({ dataCompleteness: 1, degradedSources: [] })
  })

  it('drops proportionally to the failed source weight', () => {
    const report = computeCompleteness({ etherscan: 'HTTP 503' })
    expect(report.dataCompleteness).toBe(0.6)
    expect(report.degradedSources).toEqual(['etherscan'])
  })

  it('reaches 0 when every source failed', () => {
    const report = computeCompleteness({
      etherscan: 'x',
      alchemy: 'x',
      aave: 'x',
      compound: 'x',
      uniswap: 'x',
    })
    expect(report.dataCompleteness).toBe(0)
    expect(report.degradedSources).toHaveLength(5)
  })
})

describe('per-chain source priority', () => {
  it('gives Avalanche a working non-Etherscan primary', () => {
    const sources = txHistorySourcesFor(43114)
    expect(sources[0].name).toBe('snowtrace')
  })

  it('gives mainnet an independent second source', () => {
    const names = txHistorySourcesFor(1).map((s) => s.name)
    expect(names[0]).toBe('etherscan_v2')
    expect(names).toContain('alchemy')
  })

  it('gives Scroll a non-Etherscan path', () => {
    expect(txHistorySourcesFor(534352)[0].name).toBe('alchemy')
  })
})
