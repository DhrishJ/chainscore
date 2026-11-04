import { afterEach, describe, expect, it, vi } from 'vitest'
import { assessReadability } from '@/lib/scoring/availability'
import { scoreEvmWallet } from '@/lib/scoring/live'
import { SCORE_MAX, SCORE_MIN, MODEL_VERSION } from '@/lib/site/modelFacts'

// End-to-end proof of the live scoring path (D-042): real ingest adapters,
// real feature building, the real model, the real envelope. Only the network
// is replaced, with responses shaped exactly like Etherscan v2, Alchemy and
// The Graph's. The outage cases pin that a failed source is reported as an
// outage (503), never as "new wallet" or "never borrowed".

const DAY = 86400
const now = () => Math.floor(Date.now() / 1000)

interface Scenario {
  txs?: number // transactions in history; 0 = genuinely empty wallet
  ageDays?: number
  borrows?: number
  repays?: number
  liquidations?: number
  historyDown?: boolean
  lendingDown?: boolean
  everythingDown?: boolean
}

function txList(n: number, ageDays: number, address: string) {
  const start = now() - ageDays * DAY
  return Array.from({ length: n }, (_, i) => {
    // spread evenly from first activity to today, newest first
    const ts = now() - Math.floor(((ageDays * DAY) / Math.max(1, n - 1)) * i)
    return {
      hash: `0x${(i + 1).toString(16).padStart(64, '0')}`,
      timeStamp: String(Math.max(start, ts)),
      from: i % 2 ? address : '0x' + 'ab'.repeat(20),
      to: i % 2 ? '0x' + 'cd'.repeat(20) : address,
      value: '1000000000000000',
    }
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubNetwork(address: string, s: Scenario) {
  const { txs = 0, ageDays = 900, borrows = 0, repays = 0, liquidations = 0 } = s
  const list = txList(txs, ageDays, address)
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (s.everythingDown) throw new TypeError('fetch failed')
    const url = String(input)

    if (url.startsWith('https://api.etherscan.io/v2/api')) {
      if (s.historyDown) return json({ status: '0', message: 'NOTOK', result: 'Invalid API Key' })
      if (list.length === 0) return json({ status: '0', message: 'No transactions found', result: [] })
      const asc = url.includes('sort=asc')
      return json({ status: '1', message: 'OK', result: asc ? [list[list.length - 1]] : list })
    }

    if (url.includes('.g.alchemy.com/nft/v3/')) return json({ ownedNfts: [], totalCount: 0 })

    if (url.includes('.g.alchemy.com/v2/')) {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const reply = (result: unknown) => json({ jsonrpc: '2.0', id: body.id ?? 1, result })
      switch (body.method) {
        case 'eth_getBalance':
          return reply('0x1bc16d674ec80000') // 2 ETH
        case 'alchemy_getTokenBalances':
          return reply({
            address,
            tokenBalances: [
              // 2,500 USDC
              { contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', tokenBalance: '0x' + (2_500_000_000).toString(16).padStart(64, '0') },
            ],
          })
        case 'eth_getCode':
          return reply('0x')
        case 'alchemy_getAssetTransfers':
          if (s.historyDown) return json({ jsonrpc: '2.0', id: body.id ?? 1, error: { code: -32600, message: 'Must be authenticated!' } })
          return reply({ transfers: [] })
        default:
          // ENS lookups and anything else: revert, which callers tolerate.
          return json({ jsonrpc: '2.0', id: body.id ?? 1, error: { code: 3, message: 'execution reverted' } })
      }
    }

    if (url.startsWith('https://gateway.thegraph.com/api/')) {
      if (s.lendingDown) return json({ errors: [{ message: 'subgraph not found: deployment unavailable' }] })
      const body = JSON.parse(String(init?.body ?? '{}'))
      const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))
      const messari = String(body.query).includes('liquidates')
      return json({
        data: {
          borrows: ids(borrows),
          repays: ids(repays),
          [messari ? 'liquidates' : 'liquidationCalls']: ids(liquidations),
        },
      })
    }

    throw new Error(`unexpected request in test: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let n = 0
const freshAddress = () => '0x' + (++n).toString(16).padStart(4, '0') + '7a16ff8270133f063aab6c9977183d9e7283'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('assessReadability', () => {
  it('reads a wallet when the sources answered, even if empty', () => {
    expect(assessReadability({ lending: [{ deployments: 2, answered: 2 }, { deployments: 1, answered: 1 }] }).ok).toBe(true)
  })

  it('reports an outage when both history lookups failed', () => {
    const r = assessReadability({ firstTxError: 'x', historyError: 'y', lending: [{ deployments: 1, answered: 1 }] })
    expect(r).toMatchObject({ ok: false, reason: 'history' })
  })

  it('tolerates one history lookup failing', () => {
    expect(assessReadability({ firstTxError: 'x', lending: [{ deployments: 1, answered: 1 }] }).ok).toBe(true)
  })

  it('reports an outage when no lending deployment answered', () => {
    const r = assessReadability({ lending: [{ deployments: 2, answered: 0 }, { deployments: 1, answered: 0 }] })
    expect(r).toMatchObject({ ok: false, reason: 'lending' })
  })

  it('accepts partial lending coverage', () => {
    expect(assessReadability({ lending: [{ deployments: 2, answered: 1 }, { deployments: 1, answered: 0 }] }).ok).toBe(true)
  })

  it('treats a chain with no lending deployments as readable', () => {
    expect(assessReadability({ lending: [{ deployments: 0, answered: 0 }] }).ok).toBe(true)
  })
})

describe('scoreEvmWallet: the live pipeline end to end', () => {
  it('scores a borrower from provider data: bounded, graded, versioned, complete', async () => {
    const address = freshAddress()
    stubNetwork(address, { txs: 240, ageDays: 1100, borrows: 6, repays: 6 })
    const { envelope, error } = await scoreEvmWallet(address, 'ethereum')
    expect(error).toBeUndefined()
    expect(envelope).not.toBeNull()
    const e = envelope!
    expect(e.newWallet).toBe(false)
    expect(e.noBorrowHistory).toBe(false)
    expect(e.score).toBeGreaterThanOrEqual(SCORE_MIN)
    expect(e.score).toBeLessThanOrEqual(SCORE_MAX)
    expect(['A', 'B', 'C', 'D', 'F']).toContain(e.grade)
    expect(e.modelVersion).toBe(MODEL_VERSION)
    expect(e.calibratedPD).toBeGreaterThan(0)
    expect(e.calibratedPD).toBeLessThan(1)
    expect(e.factors.length).toBeGreaterThanOrEqual(4)
    expect(e.dataCompleteness).toBe(1)
    expect(e.degradedSources).toEqual([])
  })

  it('a liquidated borrower scores below the same borrower without liquidations', async () => {
    const clean = freshAddress()
    stubNetwork(clean, { txs: 240, ageDays: 1100, borrows: 6, repays: 6 })
    const a = (await scoreEvmWallet(clean, 'ethereum')).envelope!
    vi.unstubAllGlobals()
    const liquidated = freshAddress()
    stubNetwork(liquidated, { txs: 240, ageDays: 1100, borrows: 6, repays: 4, liquidations: 2 })
    const b = (await scoreEvmWallet(liquidated, 'ethereum')).envelope!
    expect(b.score).toBeLessThan(a.score)
  })

  it('a wallet that never borrowed gets the honest no-history state, not a number', async () => {
    const address = freshAddress()
    stubNetwork(address, { txs: 80, ageDays: 400 })
    const { envelope } = await scoreEvmWallet(address, 'ethereum')
    expect(envelope?.noBorrowHistory).toBe(true)
    expect(envelope?.dataCompleteness).toBe(1)
  })

  it('a provider outage is a 503, never "new wallet"', async () => {
    const address = freshAddress()
    stubNetwork(address, { everythingDown: true })
    const { envelope, error } = await scoreEvmWallet(address, 'ethereum')
    expect(envelope).toBeNull()
    expect(error?.status).toBe(503)
  })

  it('lending subgraphs down is a 503, never "never borrowed"', async () => {
    const address = freshAddress()
    stubNetwork(address, { txs: 240, ageDays: 1100, lendingDown: true })
    const { envelope, error } = await scoreEvmWallet(address, 'ethereum')
    expect(envelope).toBeNull()
    expect(error?.status).toBe(503)
    expect(error?.message).toMatch(/lending history/i)
  })

  it('transaction history down (bad keys) is a 503', async () => {
    const address = freshAddress()
    stubNetwork(address, { borrows: 3, repays: 3, historyDown: true })
    const { envelope, error } = await scoreEvmWallet(address, 'ethereum')
    expect(envelope).toBeNull()
    expect(error?.status).toBe(503)
    expect(error?.message).toMatch(/transaction history/i)
  })
})
