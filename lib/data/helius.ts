const HELIUS_API_KEY = process.env.HELIUS_API_KEY || ''
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
const HELIUS_API_BASE = `https://api.helius.xyz/v0`

// Known liquid staking token mints
const MSOL_MINT = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'
const JITOSOL_MINT = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'
const BSOL_MINT = 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    next: { revalidate: 3600 },
  })
  const json = await res.json()
  return json.result
}

export async function getSolanaTransactionHistory(address: string) {
  try {
    const sigs = await rpcCall('getSignaturesForAddress', [address, { limit: 1000 }])
    if (!Array.isArray(sigs)) return { txCount: 0, activeMonthsLast12: 0, firstTimestamp: null }

    const txCount = sigs.length
    const firstTimestamp: number | null =
      sigs.length > 0 ? (sigs[sigs.length - 1].blockTime ?? null) : null

    const twelveMonthsAgo = Date.now() / 1000 - 365 * 86400
    const monthSet = new Set<string>()
    for (const sig of sigs) {
      if (sig.blockTime && sig.blockTime > twelveMonthsAgo) {
        const d = new Date(sig.blockTime * 1000)
        monthSet.add(`${d.getFullYear()}-${d.getMonth()}`)
      }
    }

    return { txCount, activeMonthsLast12: monthSet.size, firstTimestamp }
  } catch {
    return { txCount: 0, activeMonthsLast12: 0, firstTimestamp: null, error: 'fetch failed' }
  }
}

export async function getSolanaBalance(address: string) {
  try {
    const result = await rpcCall('getBalance', [address])
    return { solBalance: (result?.value ?? 0) / 1e9 }
  } catch {
    return { solBalance: 0, error: 'fetch failed' }
  }
}

export interface SolanaTokenData {
  hasMSOL: boolean
  hasJitoSOL: boolean
  hasBSOL: boolean
  tokenCount: number
  error?: string
}

export async function getSolanaTokenData(address: string): Promise<SolanaTokenData> {
  try {
    const result = await rpcCall('getTokenAccountsByOwner', [
      address,
      { programId: TOKEN_PROGRAM },
      { encoding: 'jsonParsed' },
    ])
    const accounts = result?.value ?? []

    let hasMSOL = false, hasJitoSOL = false, hasBSOL = false, tokenCount = 0
    for (const acc of accounts) {
      const info = acc.account?.data?.parsed?.info
      if (!info) continue
      const amount = parseInt(info.tokenAmount?.amount ?? '0')
      if (amount > 0) {
        tokenCount++
        if (info.mint === MSOL_MINT) hasMSOL = true
        if (info.mint === JITOSOL_MINT) hasJitoSOL = true
        if (info.mint === BSOL_MINT) hasBSOL = true
      }
    }
    return { hasMSOL, hasJitoSOL, hasBSOL, tokenCount }
  } catch {
    return { hasMSOL: false, hasJitoSOL: false, hasBSOL: false, tokenCount: 0, error: 'fetch failed' }
  }
}

export interface SolanaDefiData {
  hasJupiter: boolean
  hasKamino: boolean
  hasSolend: boolean
  hasMarginfi: boolean
  hasMarinade: boolean
  borrowCount: number
  repayCount: number
  error?: string
}

export async function getSolanaDefiActivity(address: string): Promise<SolanaDefiData> {
  const empty: SolanaDefiData = {
    hasJupiter: false, hasKamino: false, hasSolend: false,
    hasMarginfi: false, hasMarinade: false, borrowCount: 0, repayCount: 0,
  }
  try {
    const url = `${HELIUS_API_BASE}/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=100`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return empty

    const txs: Array<{ source?: string; type?: string }> = await res.json()

    let hasJupiter = false, hasKamino = false, hasSolend = false
    let hasMarginfi = false, hasMarinade = false
    let borrowCount = 0, repayCount = 0

    for (const tx of txs) {
      const src = tx.source ?? ''
      const type = tx.type ?? ''

      if (['JUPITER', 'JUPITER_DCA', 'JUPITER_LIMIT_ORDER'].includes(src)) hasJupiter = true
      if (['KAMINO', 'HUBBLE'].includes(src)) hasKamino = true
      if (src === 'SOLEND') hasSolend = true
      if (src === 'MARGINFI') hasMarginfi = true
      if (['MARINADE', 'MARINADE_FINANCE'].includes(src)) hasMarinade = true

      if (type === 'BORROW') borrowCount++
      if (['REPAY', 'LOAN_REPAYMENT'].includes(type)) repayCount++
    }

    return { hasJupiter, hasKamino, hasSolend, hasMarginfi, hasMarinade, borrowCount, repayCount }
  } catch {
    return { ...empty, error: 'fetch failed' }
  }
}
