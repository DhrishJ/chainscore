function etherscanBase(chainId: number): string {
  return `https://api.etherscan.io/v2/api?chainid=${chainId}`
}

function apiKey(): string {
  return process.env.ETHERSCAN_API_KEY || ''
}

export interface TxHistoryResult {
  txCount: number
  activeMonthsLast12: number
  error?: string
}

export interface FirstTxResult {
  timestamp: number | null
  error?: string
}

export async function getFirstTransaction(address: string, chainId = 1): Promise<FirstTxResult> {
  try {
    const url = `${etherscanBase(chainId)}&module=account&action=txlist&address=${address}&sort=asc&page=1&offset=1&apikey=${apiKey()}`
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
  try {
    const url = `${etherscanBase(chainId)}&module=account&action=txlist&address=${address}&sort=desc&page=1&offset=10000&apikey=${apiKey()}`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    const json = await res.json()

    if (json.status !== '1') {
      return { txCount: 0, activeMonthsLast12: 0 }
    }

    const txns: Array<{ timeStamp: string }> = json.result || []
    const txCount = txns.length

    const now = Date.now() / 1000
    const twelveMonthsAgo = now - 365 * 24 * 3600
    const monthSet = new Set<string>()
    for (const tx of txns) {
      const ts = parseInt(tx.timeStamp, 10)
      if (ts >= twelveMonthsAgo) {
        const d = new Date(ts * 1000)
        monthSet.add(`${d.getFullYear()}-${d.getMonth()}`)
      }
    }

    return { txCount, activeMonthsLast12: monthSet.size }
  } catch (e) {
    return { txCount: 0, activeMonthsLast12: 0, error: String(e) }
  }
}
