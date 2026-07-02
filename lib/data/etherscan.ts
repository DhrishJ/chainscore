import coverage from './coverage.generated.json'

// Per-chain txlist endpoint resolver. Single source: model/config.yaml ->
// coverage.generated.json (txExplorers). Etherscan v2 free tier does not serve
// Scroll or Avalanche, so those route to verified keyless explorers
// (blockscout.scroll.io, api.snowtrace.io). All return the Etherscan txlist shape.
interface TxExplorer { chainId: number; kind: string; base?: string }
const TX_EXPLORERS: Record<string, TxExplorer> = (coverage as { txExplorers?: Record<string, TxExplorer> }).txExplorers || {}
const BY_CHAIN_ID: Record<number, TxExplorer> = Object.fromEntries(
  Object.values(TX_EXPLORERS).map((e) => [e.chainId, e])
)

function apiKey(): string {
  return process.env.ETHERSCAN_API_KEY || ''
}

// Build a txlist URL for the given chain. `action` is txlist; `extra` appends
// paging/sort. Returns null if the chain has no configured explorer.
function txlistUrl(address: string, chainId: number, extra: string): string | null {
  const e = BY_CHAIN_ID[chainId]
  if (!e) {
    // Fallback to Etherscan v2 for any chain not in the map (keeps old behavior).
    return `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=txlist&address=${address}&${extra}&apikey=${apiKey()}`
  }
  const q = `module=account&action=txlist&address=${address}&${extra}`
  if (e.kind === 'etherscan_v2') {
    return `https://api.etherscan.io/v2/api?chainid=${e.chainId}&${q}&apikey=${apiKey()}`
  }
  // blockscout / snowtrace: keyless Etherscan-compatible explorer
  return `${e.base}?${q}`
}

export interface TxHistoryResult {
  txCount: number
  txCount30d: number
  txCount90d: number
  txCount180d: number
  activeDaysCount: number
  activeMonthsLast12: number
  error?: string
}

export interface FirstTxResult {
  timestamp: number | null
  error?: string
}

export async function getFirstTransaction(address: string, chainId = 1): Promise<FirstTxResult> {
  try {
    const url = txlistUrl(address, chainId, 'sort=asc&page=1&offset=1')
    if (!url) return { timestamp: null }
    const res = await fetch(url, { next: { revalidate: 3600 } })
    const json = await res.json()

    if (json.status !== '1' || !json.result?.length) {
      return { timestamp: null }
    }

    const ts = parseInt(json.result[0].timeStamp, 10)
    return { timestamp: isNaN(ts) ? null : ts }
  } catch (e) {
    return { timestamp: null, error: String(e) }
  }
}

export async function getTransactionHistory(address: string, chainId = 1): Promise<TxHistoryResult> {
  const empty = { txCount: 0, txCount30d: 0, txCount90d: 0, txCount180d: 0, activeDaysCount: 0, activeMonthsLast12: 0 }
  try {
    const url = txlistUrl(address, chainId, 'sort=desc&page=1&offset=10000')
    if (!url) return empty
    const res = await fetch(url, { next: { revalidate: 3600 } })
    const json = await res.json()

    if (json.status !== '1') {
      return empty
    }

    const txns: Array<{ timeStamp: string }> = json.result || []
    const txCount = txns.length

    const now = Date.now() / 1000
    const d30  = now - 30  * 86400
    const d90  = now - 90  * 86400
    const d180 = now - 180 * 86400
    const d365 = now - 365 * 86400

    let txCount30d = 0, txCount90d = 0, txCount180d = 0
    const monthSet = new Set<string>()
    const daySet   = new Set<string>()

    for (const tx of txns) {
      const ts = parseInt(tx.timeStamp, 10)
      if (ts >= d30)  txCount30d++
      if (ts >= d90)  txCount90d++
      if (ts >= d180) txCount180d++
      if (ts >= d365) {
        const d = new Date(ts * 1000)
        monthSet.add(`${d.getFullYear()}-${d.getMonth()}`)
      }
      const day = new Date(ts * 1000)
      daySet.add(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`)
    }

    return {
      txCount,
      txCount30d,
      txCount90d,
      txCount180d,
      activeDaysCount: daySet.size,
      activeMonthsLast12: monthSet.size,
    }
  } catch (e) {
    return { ...empty, error: String(e) }
  }
}
