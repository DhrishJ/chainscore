/**
 * ChainScore ML — Training Data Collector
 *
 * Queries Aave V2 + V3 on The Graph to get borrowers and their outcomes,
 * then fetches on-chain features for each wallet via Etherscan.
 *
 * Output: ml/data/training_data.csv
 *
 * Usage:
 *   cd chainscore
 *   node ml/scripts/collect_data.mjs
 *
 * Expects these env vars (reads from .env.local automatically):
 *   THEGRAPH_API_KEY, ETHERSCAN_API_KEY
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Load .env.local manually (no dotenv dependency needed)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
}

const THEGRAPH_API_KEY = process.env.THEGRAPH_API_KEY || ''
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ''

if (!THEGRAPH_API_KEY || !ETHERSCAN_API_KEY) {
  console.error('Missing THEGRAPH_API_KEY or ETHERSCAN_API_KEY in .env.local')
  process.exit(1)
}

const SUBGRAPH_IDS = {
  // Aave V2 subgraph deprecated on The Graph decentralized network — V3 only
  aaveV3: 'GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF',
}

const OUTPUT_PATH = path.resolve(__dirname, '../data/training_data.csv')
const SAMPLE_SIZE = 2000   // wallets per class (liquidated / not liquidated)
const ETHERSCAN_DELAY = 250 // ms between Etherscan calls (4/sec, under 5/sec limit)

// ─── The Graph helpers ───────────────────────────────────────────────────────

function gatewayUrl(subgraphId) {
  return `https://gateway.thegraph.com/api/${THEGRAPH_API_KEY}/subgraphs/id/${subgraphId}`
}

async function queryGraph(url, query, variables = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

// ─── Fetch borrowers (ID-based pagination for large datasets) ────────────────

async function fetchAllBorrowers(subgraphId, label) {
  const url = gatewayUrl(subgraphId)
  const borrowers = new Map() // address → { borrows, repays, liquidations }
  let lastId = ''

  console.log(`  Paginating ${label} borrows...`)
  while (true) {
    const data = await queryGraph(url, `
      query($lastId: String!) {
        borrows(first: 1000, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
          id
          user { id }
        }
      }
    `, { lastId })

    const items = data.borrows
    if (!items.length) break

    for (const b of items) {
      const addr = b.user.id.toLowerCase()
      if (!borrowers.has(addr)) borrowers.set(addr, { borrows: 0, repays: 0, liquidations: 0 })
      borrowers.get(addr).borrows++
    }

    lastId = items[items.length - 1].id
    process.stdout.write(`\r    ${borrowers.size} unique borrowers found...`)
    await sleep(150)
    if (items.length < 1000) break
  }

  console.log()
  console.log(`  Paginating ${label} repays...`)
  lastId = ''
  while (true) {
    const data = await queryGraph(url, `
      query($lastId: String!) {
        repays(first: 1000, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
          id
          user { id }
        }
      }
    `, { lastId })

    const items = data.repays
    if (!items.length) break

    for (const r of items) {
      const addr = r.user.id.toLowerCase()
      if (borrowers.has(addr)) borrowers.get(addr).repays++
    }

    lastId = items[items.length - 1].id
    await sleep(150)
    if (items.length < 1000) break
  }

  console.log(`  Paginating ${label} liquidations...`)
  lastId = ''
  while (true) {
    const data = await queryGraph(url, `
      query($lastId: String!) {
        liquidationCalls(first: 1000, orderBy: id, orderDirection: asc, where: { id_gt: $lastId }) {
          id
          user { id }
        }
      }
    `, { lastId })

    const items = data.liquidationCalls
    if (!items.length) break

    for (const l of items) {
      const addr = l.user.id.toLowerCase()
      if (borrowers.has(addr)) borrowers.get(addr).liquidations++
    }

    lastId = items[items.length - 1].id
    await sleep(150)
    if (items.length < 1000) break
  }

  return borrowers
}

// ─── Etherscan feature fetch ─────────────────────────────────────────────────

async function getWalletFeatures(address) {
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&sort=asc&page=1&offset=10000&apikey=${ETHERSCAN_API_KEY}`
    const res = await fetch(url)
    const json = await res.json()

    if (json.status !== '1' || !json.result?.length) return null

    const txns = json.result
    const firstTs = parseInt(txns[0].timeStamp, 10)
    const now = Date.now() / 1000
    const walletAgeDays = Math.floor((now - firstTs) / 86400)
    const txCount = txns.length

    // Active months in last 12
    const twelveMonthsAgo = now - 365 * 24 * 3600
    const monthSet = new Set()
    let contractInteractions = 0
    for (const tx of txns) {
      const ts = parseInt(tx.timeStamp, 10)
      if (ts >= twelveMonthsAgo) {
        const d = new Date(ts * 1000)
        monthSet.add(`${d.getFullYear()}-${d.getMonth()}`)
      }
      if (tx.input && tx.input !== '0x') contractInteractions++
    }

    const contractRatio = txCount > 0 ? contractInteractions / txCount : 0

    // Unique counterparties (rough social graph signal)
    const counterparties = new Set(txns.map(tx => tx.to?.toLowerCase()).filter(Boolean))

    return {
      wallet_age_days: walletAgeDays,
      tx_count: txCount,
      active_months_last_12: monthSet.size,
      contract_interaction_ratio: Math.round(contractRatio * 100) / 100,
      unique_counterparties: counterparties.size,
    }
  } catch {
    return null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function appendCsvRow(row) {
  fs.appendFileSync(OUTPUT_PATH, row + '\n', 'utf8')
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== ChainScore ML Data Collector ===\n')

  // Step 1: Collect borrowers from Aave V3
  console.log('Step 1: Fetching borrowers from The Graph (Aave V3)...')
  const allBorrowers = await fetchAllBorrowers(SUBGRAPH_IDS.aaveV3, 'Aave V3')

  const liquidatedAddrs = [...allBorrowers.entries()]
    .filter(([, s]) => s.liquidations > 0)
    .map(([addr]) => addr)

  const notLiquidatedAddrs = [...allBorrowers.entries()]
    .filter(([, s]) => s.liquidations === 0 && s.repays > 0) // must have actually repaid
    .map(([addr]) => addr)

  console.log(`\nTotal borrowers: ${allBorrowers.size}`)
  console.log(`  Liquidated:     ${liquidatedAddrs.length}`)
  console.log(`  Clean repayers: ${notLiquidatedAddrs.length}`)

  // Step 2: Sample evenly from both classes
  const sample = [
    ...liquidatedAddrs.slice(0, SAMPLE_SIZE).map(addr => ({ addr, label: 1 })),
    ...notLiquidatedAddrs.slice(0, SAMPLE_SIZE).map(addr => ({ addr, label: 0 })),
  ]

  console.log(`\nStep 2: Collecting on-chain features for ${sample.length} wallets...`)
  console.log('(This will take a while due to Etherscan rate limits)\n')

  // Write CSV header
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(
    OUTPUT_PATH,
    'address,wallet_age_days,tx_count,active_months_last_12,contract_interaction_ratio,unique_counterparties,aave_borrows,aave_repays,aave_liquidations,repay_ratio,was_liquidated\n',
    'utf8'
  )

  let saved = 0
  let failed = 0

  for (let i = 0; i < sample.length; i++) {
    const { addr, label } = sample[i]
    const stats = allBorrowers.get(addr)

    if (i % 100 === 0) {
      console.log(`Progress: ${i}/${sample.length} (saved: ${saved}, failed: ${failed})`)
    }

    const features = await getWalletFeatures(addr)
    if (!features) {
      failed++
      await sleep(ETHERSCAN_DELAY)
      continue
    }

    const repayRatio = stats.borrows > 0
      ? Math.round((stats.repays / stats.borrows) * 100) / 100
      : 0

    appendCsvRow([
      addr,
      features.wallet_age_days,
      features.tx_count,
      features.active_months_last_12,
      features.contract_interaction_ratio,
      features.unique_counterparties,
      stats.borrows,
      stats.repays,
      stats.liquidations,
      repayRatio,
      label,
    ].join(','))

    saved++
    await sleep(ETHERSCAN_DELAY)
  }

  console.log(`\n=== Done ===`)
  console.log(`Saved: ${saved} rows`)
  console.log(`Failed: ${failed} wallets (no tx history)`)
  console.log(`Output: ${OUTPUT_PATH}`)
  console.log(`\nNext step: run ml/scripts/train.py to train the model`)
}

main().catch(console.error)
