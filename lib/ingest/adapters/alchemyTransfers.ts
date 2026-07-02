import { env } from '@/lib/env.server'
import { withProviderLimit } from '../rateLimiter'
import { SourceError, TxHistorySource, TxRecord } from '../types'

// Second, independent transaction-history source built on Alchemy's
// alchemy_getAssetTransfers. Not byte-identical to an explorer txlist (it
// reports transfers, so a tx with no value movement can be missed), but close
// enough for the activity features and, critically, from different
// infrastructure than the Etherscan family.

// getAssetTransfers with the 'external' category is available on these
// networks only (notably not Avalanche or BNB).
const NETWORK_BY_CHAIN: Record<number, string> = {
  1: 'eth-mainnet',
  137: 'polygon-mainnet',
  42161: 'arb-mainnet',
  10: 'opt-mainnet',
  8453: 'base-mainnet',
}

interface TransfersPage {
  transfers: Array<{ hash: string; metadata?: { blockTimestamp?: string } }>
  pageKey?: string
}

interface RpcResponse {
  result?: TransfersPage
  error?: { code: number; message: string }
}

const MIN_INTERVAL_MS = 120

export class AlchemyTransfersSource implements TxHistorySource {
  readonly name = 'alchemy'

  supportsChain(chainId: number): boolean {
    return chainId in NETWORK_BY_CHAIN
  }

  private async rpc(chainId: number, params: Record<string, unknown>): Promise<TransfersPage> {
    const network = NETWORK_BY_CHAIN[chainId]
    if (!network) throw new SourceError(`alchemy: unsupported chain ${chainId}`, false)
    const res = await withProviderLimit(this.name, MIN_INTERVAL_MS, () =>
      fetch(`https://${network}.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'alchemy_getAssetTransfers',
          params: [{ category: ['external'], withMetadata: true, excludeZeroValue: false, ...params }],
        }),
        next: { revalidate: 3600 },
      })
    )
    if (!res.ok) {
      throw new SourceError(`alchemy HTTP ${res.status}`, res.status === 429 || res.status >= 500)
    }
    const json = (await res.json()) as RpcResponse
    if (json.error) throw new SourceError(`alchemy: ${json.error.message}`, json.error.code === 429)
    return json.result ?? { transfers: [] }
  }

  private static toRecord(t: { hash: string; metadata?: { blockTimestamp?: string } }): TxRecord {
    const iso = t.metadata?.blockTimestamp
    return { hash: t.hash, timeStamp: iso ? Math.floor(Date.parse(iso) / 1000) : NaN }
  }

  async getFirstTransactionTimestamp(address: string, chainId: number): Promise<number | null> {
    // Oldest outgoing and oldest incoming; the wallet's first activity is the
    // earlier of the two.
    const [from, to] = await Promise.all([
      this.rpc(chainId, { fromAddress: address, order: 'asc', maxCount: '0x1' }),
      this.rpc(chainId, { toAddress: address, order: 'asc', maxCount: '0x1' }),
    ])
    const stamps = [...from.transfers, ...to.transfers]
      .map((t) => AlchemyTransfersSource.toRecord(t).timeStamp)
      .filter((ts) => !Number.isNaN(ts))
    if (stamps.length === 0) return null
    return Math.min(...stamps)
  }

  async getTransactionList(address: string, chainId: number, limit: number): Promise<TxRecord[]> {
    // Outgoing transfers approximate the wallet's own transactions (the
    // explorer txlist equivalent is sender-initiated activity plus incoming;
    // we merge both directions and dedupe by hash).
    const collect = async (dir: 'fromAddress' | 'toAddress'): Promise<TxRecord[]> => {
      const out: TxRecord[] = []
      let pageKey: string | undefined
      while (out.length < limit) {
        const page: TransfersPage = await this.rpc(chainId, {
          [dir]: address,
          order: 'desc',
          maxCount: '0x3e8',
          ...(pageKey ? { pageKey } : {}),
        })
        out.push(...page.transfers.map(AlchemyTransfersSource.toRecord))
        if (!page.pageKey) break
        pageKey = page.pageKey
      }
      return out
    }

    const [sent, received] = await Promise.all([collect('fromAddress'), collect('toAddress')])
    const byHash = new Map<string, TxRecord>()
    for (const t of [...sent, ...received]) {
      if (!Number.isNaN(t.timeStamp) && !byHash.has(t.hash)) byHash.set(t.hash, t)
    }
    return [...byHash.values()].sort((a, b) => b.timeStamp - a.timeStamp).slice(0, limit)
  }
}
