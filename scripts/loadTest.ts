// Load-test harness for the v1 partner scoring API (Workstream E).
//
//   npm run loadtest -- [--base http://localhost:3000] [--address 0x...] \
//     [--concurrency 20] [--total 500]
//
// The API key is read from the CHAINSCORE_API_KEY environment variable, never
// from argv, so it never ends up in shell history or process listings.
//
// Fires GET {base}/api/v1/score/{address} with a bearer header, bounded by a
// simple worker-pool (no dependencies), and reports latency percentiles,
// throughput, a status-code histogram, and cached vs. uncached counts.
//
// This script only implements and (optionally) smoke-tests the harness. It
// never launches a server itself, and it never fires the full configured
// load without an explicit run.

import { performance } from 'node:perf_hooks'

interface Args {
  base: string
  address: string
  apiKey: string | undefined
  concurrency: number
  total: number
}

interface RequestResult {
  status: number
  latencyMs: number
  cachedHeader: string | null
  error: string | null
}

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = argv[i + 1]
      if (value !== undefined && !value.startsWith('--')) {
        flags[key] = value
        i += 1
      } else {
        flags[key] = 'true'
      }
    }
  }

  const base = flags.base ?? process.env.CHAINSCORE_BASE_URL ?? 'http://localhost:3000'
  const address = flags.address ?? process.env.CHAINSCORE_ADDRESS ?? '0x1234567890abcdef1234567890abcdef12345678'
  const apiKey = process.env.CHAINSCORE_API_KEY
  const concurrency = Number(flags.concurrency ?? 20)
  const total = Number(flags.total ?? 500)

  return {
    base: base.replace(/\/+$/, ''),
    address,
    apiKey,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : 20,
    total: Number.isFinite(total) && total > 0 ? Math.floor(total) : 500,
  }
}

// Fires a single scoring request and records its outcome. Never throws: a
// network failure is recorded as status 0 with an error message so the
// summary can still report on partial failures instead of crashing the run.
async function fireOne(base: string, address: string, apiKey: string | undefined): Promise<RequestResult> {
  const url = `${base}/api/v1/score/${address}`
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const start = performance.now()
  try {
    const res = await fetch(url, { headers })
    // Draining the body counts it fully toward latency and avoids leaving
    // the connection half-read.
    await res.arrayBuffer()
    const latencyMs = performance.now() - start
    return {
      status: res.status,
      latencyMs,
      cachedHeader: res.headers.get('x-chainscore-cached'),
      error: null,
    }
  } catch (e) {
    const latencyMs = performance.now() - start
    return {
      status: 0,
      latencyMs,
      cachedHeader: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// Bounded-concurrency worker pool: `concurrency` workers each pull the next
// job index off a shared counter until the pool of `total` jobs is drained.
// No dependency on any queue library.
async function runPool(args: Args): Promise<RequestResult[]> {
  const results: RequestResult[] = new Array(args.total)
  let nextIndex = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= args.total) return
      results[index] = await fireOne(args.base, args.address, args.apiKey)
    }
  }

  const workerCount = Math.min(args.concurrency, args.total)
  const workers = Array.from({ length: workerCount }, () => worker())
  await Promise.all(workers)
  return results
}

function percentile(sortedLatencies: number[], p: number): number {
  if (sortedLatencies.length === 0) return 0
  const rank = (p / 100) * (sortedLatencies.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sortedLatencies[lower]
  const weight = rank - lower
  return sortedLatencies[lower] * (1 - weight) + sortedLatencies[upper] * weight
}

function summarize(results: RequestResult[], wallClockMs: number): void {
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b)
  const p50 = percentile(latencies, 50)
  const p95 = percentile(latencies, 95)
  const p99 = percentile(latencies, 99)
  const max = latencies.length > 0 ? latencies[latencies.length - 1] : 0
  const rps = wallClockMs > 0 ? (results.length / wallClockMs) * 1000 : 0

  const statusHistogram = new Map<number, number>()
  let cachedCount = 0
  let uncachedCount = 0
  let unknownCachedCount = 0

  for (const r of results) {
    statusHistogram.set(r.status, (statusHistogram.get(r.status) ?? 0) + 1)
    if (r.cachedHeader === 'true') cachedCount += 1
    else if (r.cachedHeader === 'false') uncachedCount += 1
    else unknownCachedCount += 1
  }

  console.log('')
  console.log('=== ChainScore v1 load test ===')
  console.log(`requests: ${results.length}, wall clock: ${(wallClockMs / 1000).toFixed(2)}s`)
  console.log('')
  console.log('Latency (ms):')
  console.log(`  p50: ${p50.toFixed(1)}`)
  console.log(`  p95: ${p95.toFixed(1)}`)
  console.log(`  p99: ${p99.toFixed(1)}`)
  console.log(`  max: ${max.toFixed(1)}`)
  console.log('')
  console.log(`Throughput: ${rps.toFixed(2)} req/s`)
  console.log('')
  console.log('Status codes:')
  const sortedStatuses = Array.from(statusHistogram.keys()).sort((a, b) => a - b)
  for (const status of sortedStatuses) {
    const label = status === 0 ? 'ERR (network)' : String(status)
    console.log(`  ${label}: ${statusHistogram.get(status)}`)
  }
  console.log('')
  console.log('X-ChainScore-Cached:')
  console.log(`  cached:   ${cachedCount}`)
  console.log(`  uncached: ${uncachedCount}`)
  if (unknownCachedCount > 0) {
    console.log(`  unknown:  ${unknownCachedCount} (header missing, e.g. on non-200 responses)`)
  }
  console.log('')
}

async function serverIsUp(base: string): Promise<boolean> {
  try {
    const res = await fetch(base, { method: 'GET' })
    return res.status < 500
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log('ChainScore load test harness')
  console.log(`  base:        ${args.base}`)
  console.log(`  address:     ${args.address}`)
  console.log(`  concurrency: ${args.concurrency}`)
  console.log(`  total:       ${args.total}`)
  console.log(`  api key:     ${args.apiKey ? 'set' : 'NOT SET (requests will 401)'}`)

  const up = await serverIsUp(args.base)
  if (!up) {
    console.log('')
    console.log(`No server responding at ${args.base}. Skipping the run; harness is implemented and ready.`)
    console.log('Start the app (e.g. `npm run dev`) and re-run `npm run loadtest` to execute it.')
    return
  }

  const start = performance.now()
  const results = await runPool(args)
  const wallClockMs = performance.now() - start
  summarize(results, wallClockMs)
}

main().catch((e) => {
  console.error('Load test failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
