// Phase 2 smoke test for multi-chain borrower detection.
// Mirrors lib/data/thegraph.ts aggregateFamily against the generated registry, so
// it verifies the same coverage the app uses. A known Arbitrum borrower must show
// borrows; a never-borrowed address must show none (so the gate still works).
//
// Run: node scripts/smoke-live-detection.mjs
// Needs THEGRAPH_API_KEY (read from .env.local).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const coverage = JSON.parse(readFileSync(join(root, 'lib/data/coverage.generated.json'), 'utf8'))

let apiKey = process.env.THEGRAPH_API_KEY || ''
if (!apiKey) {
  try {
    for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
      if (line.startsWith('THEGRAPH_API_KEY')) apiKey = line.split('=')[1].trim().replace(/['"]/g, '')
    }
  } catch {}
}

const url = (id) => `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${id}`

async function queryDeployment(d, addr) {
  const messari = d.schema === 'messari'
  const bf = messari ? 'account' : 'user'
  const le = messari ? 'liquidates' : 'liquidationCalls'
  const lf = messari ? 'liquidatee' : 'user'
  const query = `query($a:String!){ borrows(where:{${bf}:$a},first:1000){id} repays(where:{${bf}:$a},first:1000){id} ${le}(where:{${lf}:$a},first:100){id} }`
  const res = await fetch(url(d.subgraphId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { a: addr.toLowerCase() } }),
  })
  const j = await res.json()
  if (j.errors) throw new Error(j.errors[0].message)
  return (j.data?.borrows?.length || 0)
}

async function borrowsFor(family, chainSlug, addr) {
  const deps = coverage.deployments.filter((d) => d.family === family && d.chain === chainSlug)
  const counts = await Promise.allSettled(deps.map((d) => queryDeployment(d, addr)))
  return counts.reduce((s, r) => s + (r.status === 'fulfilled' ? r.value : 0), 0)
}

const cases = [
  { name: 'Arbitrum Aave borrower (expect > 0)', family: 'aave', chain: 'arbitrum',
    addr: '0xaa40cb43f78b97701d0e5981d83822ed77dd57e9', expect: 'positive' },
  { name: 'Never-borrowed address on Ethereum (expect 0)', family: 'aave', chain: 'ethereum',
    addr: '0x000000000000000000000000000000000000dEaD', expect: 'zero' },
]

let failed = 0
for (const c of cases) {
  const n = await borrowsFor(c.family, c.chain, c.addr)
  const ok = c.expect === 'positive' ? n > 0 : n === 0
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  borrows=${n}`)
}
console.log(failed === 0 ? '\nAll smoke checks passed.' : `\n${failed} smoke check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
