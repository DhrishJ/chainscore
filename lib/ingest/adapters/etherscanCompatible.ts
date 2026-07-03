import { env } from '@/lib/env.server'
import { withProviderLimit } from '../rateLimiter'
import { SourceError, TxHistorySource, TxRecord } from '../types'

// One adapter covers the whole Etherscan-shaped family: Etherscan v2 (keyed,
// multi-chain via chainid param), Blockscout instances, and Snowtrace, which
// all speak the same module=account&action=txlist protocol.

export interface EtherscanCompatibleConfig {
  name: string
  // Chains this endpoint can serve.
  chainIds: number[]
  // 'etherscan_v2' adds chainid + apikey params against the shared base URL;
  // 'keyless' hits a per-instance base URL with no key.
  kind: 'etherscan_v2' | 'keyless'
  baseUrl?: string
  minIntervalMs: number
}

const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api'

interface TxListResponse {
  status: string
  message?: string
  result?: Array<{ hash: string; timeStamp: string; from?: string; to?: string; value?: string }> | string
}

export class EtherscanCompatibleSource implements TxHistorySource {
  readonly name: string

  constructor(private readonly cfg: EtherscanCompatibleConfig) {
    this.name = cfg.name
  }

  supportsChain(chainId: number): boolean {
    return this.cfg.chainIds.includes(chainId)
  }

  private url(address: string, chainId: number, extra: string): string {
    const q = `module=account&action=txlist&address=${address}&${extra}`
    if (this.cfg.kind === 'etherscan_v2') {
      return `${ETHERSCAN_V2_BASE}?chainid=${chainId}&${q}&apikey=${env.ETHERSCAN_API_KEY}`
    }
    return `${this.cfg.baseUrl}?${q}`
  }

  private async query(address: string, chainId: number, extra: string): Promise<TxRecord[]> {
    const res = await withProviderLimit(this.name, this.cfg.minIntervalMs, () =>
      fetch(this.url(address, chainId, extra), { next: { revalidate: 3600 } })
    )
    if (!res.ok) {
      throw new SourceError(`${this.name} HTTP ${res.status}`, res.status === 429 || res.status >= 500)
    }
    const json = (await res.json()) as TxListResponse
    // status '0' with "No transactions found" is a legitimate empty result;
    // status '0' with anything else (rate limit, invalid key, unsupported
    // chain) is a source failure that must trigger failover, not a silent
    // zero-history wallet.
    if (json.status !== '1') {
      const msg = typeof json.result === 'string' ? json.result : json.message ?? 'unknown'
      if (/no transactions found/i.test(String(msg)) || /no transactions found/i.test(json.message ?? '')) {
        return []
      }
      throw new SourceError(`${this.name}: ${msg}`, /rate limit|max calls/i.test(String(msg)))
    }
    if (!Array.isArray(json.result)) return []
    return json.result.map((t) => ({
      hash: t.hash,
      timeStamp: parseInt(t.timeStamp, 10),
      from: t.from?.toLowerCase(),
      // Contract creation rows carry an empty `to`; keep that empty string
      // rather than dropping the field, so callers can distinguish "no
      // recipient" from "unknown recipient" (undefined).
      to: t.to !== undefined ? t.to.toLowerCase() : undefined,
      valueWei: t.value,
    }))
  }

  async getFirstTransactionTimestamp(address: string, chainId: number): Promise<number | null> {
    const txs = await this.query(address, chainId, 'sort=asc&page=1&offset=1')
    if (txs.length === 0) return null
    return Number.isNaN(txs[0].timeStamp) ? null : txs[0].timeStamp
  }

  async getTransactionList(address: string, chainId: number, limit: number): Promise<TxRecord[]> {
    return this.query(address, chainId, `sort=desc&page=1&offset=${limit}`)
  }
}
