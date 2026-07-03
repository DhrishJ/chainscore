import { afterEach, describe, expect, it, vi } from 'vitest'
import { EtherscanCompatibleSource } from '@/lib/ingest/adapters/etherscanCompatible'
import { AlchemyTransfersSource } from '@/lib/ingest/adapters/alchemyTransfers'

// Counterparty enrichment on TxRecord (from/to/valueWei/valueEth). These
// fields are optional additions consumed by the entity-resolution and
// wash-trade work being built in parallel; this file only exercises the
// adapters' parsing, not that downstream code.

function mockFetchOnce(payload: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    })
  )
}

describe('etherscanCompatible adapter enrichment', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const makeSource = () =>
    new EtherscanCompatibleSource({
      name: 'test-etherscan',
      kind: 'keyless',
      baseUrl: 'https://example.test/api',
      chainIds: [1],
      minIntervalMs: 0,
    })

  it('lowercases from/to and carries valueWei for a normal transaction', async () => {
    mockFetchOnce({
      status: '1',
      result: [
        {
          hash: '0xAAA',
          timeStamp: '1700000000',
          from: '0xABCDEF0000000000000000000000000000000A',
          to: '0x1234567890ABCDEF1234567890ABCDEF12345678',
          value: '1000000000000000000',
        },
      ],
    })

    const txs = await makeSource().getTransactionList('0xabc', 1, 10)

    expect(txs).toHaveLength(1)
    expect(txs[0].from).toBe('0xabcdef0000000000000000000000000000000a')
    expect(txs[0].to).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(txs[0].valueWei).toBe('1000000000000000000')
  })

  it('represents contract creation as an empty to address', async () => {
    mockFetchOnce({
      status: '1',
      result: [
        {
          hash: '0xBBB',
          timeStamp: '1700000100',
          from: '0xFEDCBA9876543210FEDCBA9876543210FEDCBA9',
          to: '',
          value: '0',
        },
      ],
    })

    const txs = await makeSource().getTransactionList('0xabc', 1, 10)

    expect(txs[0].from).toBe('0xfedcba9876543210fedcba9876543210fedcba9')
    expect(txs[0].to).toBe('')
    expect(txs[0].valueWei).toBe('0')
  })

  it('handles mixed-case addresses consistently', async () => {
    mockFetchOnce({
      status: '1',
      result: [
        {
          hash: '0xCCC',
          timeStamp: '1700000200',
          from: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
          to: '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb',
          value: '42',
        },
      ],
    })

    const txs = await makeSource().getTransactionList('0xabc', 1, 10)

    expect(txs[0].from).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(txs[0].to).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
  })
})

describe('alchemyTransfers adapter enrichment', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lowercases from/to and carries valueEth for a normal transfer', async () => {
    mockFetchOnce({
      id: 1,
      jsonrpc: '2.0',
      result: {
        transfers: [
          {
            hash: '0xDDD',
            from: '0xABCDEF0000000000000000000000000000000A',
            to: '0x1234567890ABCDEF1234567890ABCDEF12345678',
            value: 1.5,
            metadata: { blockTimestamp: '2023-11-14T00:00:00.000Z' },
          },
        ],
      },
    })

    const txs = await new AlchemyTransfersSource().getTransactionList('0xabc', 1, 10)

    expect(txs).toHaveLength(1)
    expect(txs[0].from).toBe('0xabcdef0000000000000000000000000000000a')
    expect(txs[0].to).toBe('0x1234567890abcdef1234567890abcdef12345678')
    expect(txs[0].valueEth).toBe(1.5)
  })

  it('represents contract creation (null to) as an empty to address', async () => {
    mockFetchOnce({
      id: 1,
      jsonrpc: '2.0',
      result: {
        transfers: [
          {
            hash: '0xEEE',
            from: '0xFEDCBA9876543210FEDCBA9876543210FEDCBA9',
            to: null,
            value: null,
            metadata: { blockTimestamp: '2023-11-14T01:00:00.000Z' },
          },
        ],
      },
    })

    const txs = await new AlchemyTransfersSource().getTransactionList('0xabc', 1, 10)

    expect(txs[0].from).toBe('0xfedcba9876543210fedcba9876543210fedcba9')
    expect(txs[0].to).toBe('')
    expect(txs[0].valueEth).toBeUndefined()
  })

  it('handles mixed-case addresses consistently', async () => {
    mockFetchOnce({
      id: 1,
      jsonrpc: '2.0',
      result: {
        transfers: [
          {
            hash: '0xFFF',
            from: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
            to: '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb',
            value: 0.001,
            metadata: { blockTimestamp: '2023-11-14T02:00:00.000Z' },
          },
        ],
      },
    })

    const txs = await new AlchemyTransfersSource().getTransactionList('0xabc', 1, 10)

    expect(txs[0].from).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(txs[0].to).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
  })
})
