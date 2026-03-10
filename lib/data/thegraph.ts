// The Graph decentralized network gateway subgraph IDs
const SUBGRAPH_IDS = {
  // Aave V2 subgraph deprecated on The Graph decentralized network
  aaveV3: 'GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF',
  compoundV2: '4TbqVA8p2DoBd5qDbPMwmDZv3CsJjWtxo8nVSqF2tA9a',
}

function gatewayUrl(subgraphId: string): string {
  const apiKey = process.env.THEGRAPH_API_KEY || ''
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`
}

async function queryGraph(url: string, query: string, variables: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 3600 },
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

export interface AaveActivityResult {
  borrows: number
  repays: number
  liquidations: number
  error?: string
}

export async function getAaveActivity(address: string, chainSlug = 'ethereum'): Promise<AaveActivityResult> {
  if (chainSlug !== 'ethereum') return { borrows: 0, repays: 0, liquidations: 0 }

  const user = address.toLowerCase()

  const query = `
    query($user: String!) {
      borrows(where: { user: $user }, first: 1000) { id }
      repays(where: { user: $user }, first: 1000) { id }
      liquidationCalls(where: { user: $user }, first: 100) { id }
    }
  `

  let borrows = 0, repays = 0, liquidations = 0
  const errors: string[] = []

  try {
    const v3 = await queryGraph(gatewayUrl(SUBGRAPH_IDS.aaveV3), query, { user })
    if (v3) {
      borrows += v3.borrows?.length || 0
      repays += v3.repays?.length || 0
      liquidations += v3.liquidationCalls?.length || 0
    }
  } catch (e) {
    errors.push(`v3: ${e}`)
  }

  return {
    borrows,
    repays,
    liquidations,
    ...(errors.length ? { error: errors.join('; ') } : {}),
  }
}

export interface CompoundActivityResult {
  borrows: number
  repays: number
  liquidations: number
  error?: string
}

export async function getCompoundActivity(address: string, chainSlug = 'ethereum'): Promise<CompoundActivityResult> {
  if (chainSlug !== 'ethereum') return { borrows: 0, repays: 0, liquidations: 0 }

  const account = address.toLowerCase()

  // Messari standardized lending schema
  const query = `
    query($account: String!) {
      borrows(where: { account: $account }, first: 1000) { id }
      repays(where: { account: $account }, first: 1000) { id }
      liquidates(where: { liquidatee: $account }, first: 100) { id }
    }
  `

  try {
    const data = await queryGraph(gatewayUrl(SUBGRAPH_IDS.compoundV2), query, { account })
    return {
      borrows: data?.borrows?.length || 0,
      repays: data?.repays?.length || 0,
      liquidations: data?.liquidates?.length || 0,
    }
  } catch (e) {
    return { borrows: 0, repays: 0, liquidations: 0, error: String(e) }
  }
}

// Kept for interface compatibility — LP detection now done in alchemy.ts via NFT API
export interface UniswapActivityResult {
  hasLP: boolean
  error?: string
}

export async function getUniswapActivity(_address: string): Promise<UniswapActivityResult> {
  return { hasLP: false }
}
