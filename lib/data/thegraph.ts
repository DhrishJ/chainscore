import coverage from './coverage.generated.json'
import { env } from '@/lib/env.server'

// Single source of truth for protocol/chain coverage. coverage.generated.json is
// GENERATED from model/config.yaml by model/src/export_coverage.py, so live
// detection can never drift from training coverage. To change coverage, edit the
// protocols registry in config.yaml and regenerate. Never hand edit either file.
type Deployment = {
  protocol: string
  family: string
  chain: string
  schema: 'aave_v3' | 'messari'
  subgraphId: string
}
const DEPLOYMENTS = coverage.deployments as Deployment[]

function deploymentsFor(family: string, chainSlug: string): Deployment[] {
  return DEPLOYMENTS.filter((d) => d.family === family && d.chain === chainSlug)
}

function gatewayUrl(subgraphId: string): string {
  return `https://gateway.thegraph.com/api/${env.THEGRAPH_API_KEY}/subgraphs/id/${subgraphId}`
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

// Query one deployment for an address. Schema selects the field shape: Aave's own
// (borrows.user / liquidationCalls) or Messari's standardized
// (borrows.account / liquidates.liquidatee).
async function queryDeployment(d: Deployment, addr: string) {
  const messari = d.schema === 'messari'
  const borrowerField = messari ? 'account' : 'user'
  const liqEntity = messari ? 'liquidates' : 'liquidationCalls'
  const liqField = messari ? 'liquidatee' : 'user'

  const query = `
    query($a: String!) {
      borrows(where: { ${borrowerField}: $a }, first: 1000) { id }
      repays(where: { ${borrowerField}: $a }, first: 1000) { id }
      ${liqEntity}(where: { ${liqField}: $a }, first: 100) { id }
    }
  `
  const data = await queryGraph(gatewayUrl(d.subgraphId), query, { a: addr })
  return {
    borrows: data?.borrows?.length || 0,
    repays: data?.repays?.length || 0,
    liquidations: data?.[liqEntity]?.length || 0,
  }
}

// Aggregate every verified deployment of a protocol family on a chain. One
// deployment being down does not fail the whole lookup or falsely return
// "no history": failures are logged and the other deployments still count.
async function aggregateFamily(
  family: string,
  address: string,
  chainSlug: string,
): Promise<AaveActivityResult> {
  const deps = deploymentsFor(family, chainSlug)
  if (deps.length === 0) return { borrows: 0, repays: 0, liquidations: 0 }

  const addr = address.toLowerCase()
  let borrows = 0
  let repays = 0
  let liquidations = 0
  const errors: string[] = []

  const results = await Promise.allSettled(deps.map((d) => queryDeployment(d, addr)))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      borrows += r.value.borrows
      repays += r.value.repays
      liquidations += r.value.liquidations
    } else {
      errors.push(`${deps[i].protocol}/${deps[i].chain}: ${r.reason}`)
    }
  })

  return { borrows, repays, liquidations, ...(errors.length ? { error: errors.join('; ') } : {}) }
}

export async function getAaveActivity(address: string, chainSlug = 'ethereum'): Promise<AaveActivityResult> {
  return aggregateFamily('aave', address, chainSlug)
}

export interface CompoundActivityResult {
  borrows: number
  repays: number
  liquidations: number
  error?: string
}

export async function getCompoundActivity(address: string, chainSlug = 'ethereum'): Promise<CompoundActivityResult> {
  return aggregateFamily('compound', address, chainSlug)
}

// Kept for interface compatibility — LP detection now done in alchemy.ts via NFT API
export interface UniswapActivityResult {
  hasLP: boolean
  error?: string
}

export async function getUniswapActivity(_address: string): Promise<UniswapActivityResult> {
  return { hasLP: false }
}
