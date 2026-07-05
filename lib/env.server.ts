import { z } from 'zod'

// Server-only environment, parsed exactly once at module load. A missing or
// malformed variable fails the process loudly at boot instead of degrading
// into broken request URLs downstream. Nothing outside lib/env.server.ts and
// lib/env.client.ts may read process.env directly.
//
// This module must never be imported from client code. The runtime guard
// below backstops the convention.

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/env.server.ts was imported into client code. Server secrets must never reach the browser bundle.'
  )
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ETHERSCAN_API_KEY: z.string().min(1),
  ALCHEMY_API_KEY: z.string().min(1),
  THEGRAPH_API_KEY: z.string().min(1),
  HELIUS_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Optional: 'true' enables cross-source ingest reconciliation logging
  // (doubles provider load for sampled reads; leave off in production
  // until budgets are sized).
  INGEST_RECONCILE: z.string().optional(),
  // Optional: Upstash Redis REST credentials for the durable rate limiter
  // (D-013). The Vercel Marketplace integration injects the KV_* names; a
  // hand-created Upstash database uses the UPSTASH_* names. Either pair
  // works; absent both, rate limiting stays per-instance in-memory.
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // Report key names only. Never echo values: they are secrets.
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
  throw new Error(`Invalid server environment. ${problems}`)
}

export const env = parsed.data
