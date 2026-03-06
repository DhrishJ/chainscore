// The Graph decentralized network gateway subgraph IDs
const SUBGRAPH_IDS = {
  aaveV2: 'Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL57s',
  aaveV3: 'GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF',
  compoundV2: '6Wp9hNSvHBsP2GWy2DNHFHoLN5FZP9eciLKr7EBTq1rb',
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
      liquidationCalls(where: { borrower: $user }, first: 100) { id }
    }
  `

  const [v2, v3] = await Promise.allSettled([
    queryGraph(gatewayUrl(SUBGRAPH_IDS.aaveV2), query, { user }),
    queryGraph(gatewayUrl(SUBGRAPH_IDS.aaveV3), query, { user }),
  ])

  let borrows = 0, repays = 0, liquidations = 0
  const errors: string[] = []

  if (v2.status === 'fulfilled' && v2.value) {
    borrows += v2.value.borrows?.length || 0
    repays += v2.value.repays?.length || 0
    liquidations += v2.value.liquidationCalls?.length || 0
  } else if (v2.status === 'rejected') {
    errors.push(`v2: ${v2.reason}`)
  }

  if (v3.status === 'fulfilled' && v3.value) {
    borrows += v3.value.borrows?.length || 0
    repays += v3.value.repays?.length || 0
    liquidations += v3.value.liquidationCalls?.length || 0
  } else if (v3.status === 'rejected') {
    errors.push(`v3: ${v3.reason}`)
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
  error?: string
}

export async function getCompoundActivity(address: string, chainSlug = 'ethereum'): Promise<CompoundActivityResult> {
  if (chainSlug !== 'ethereum') return { borrows: 0, repays: 0 }

  const account = address.toLowerCase()

  const query = `
    query($account: String!) {
      repayEvents(where: { borrower: $account }, first: 1000) { id }
      borrowEvents(where: { borrower: $account }, first: 1000) { id }
    }
  `

  try {
    const data = await queryGraph(gatewayUrl(SUBGRAPH_IDS.compoundV2), query, { account })
    return {
      borrows: data?.borrowEvents?.length || 0,
      repays: data?.repayEvents?.length || 0,
    }
  } catch (e) {
    return { borrows: 0, repays: 0, error: String(e) }
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
