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
  // (D-013). Three naming schemes, first match wins in middleware.ts:
  // UPSTASH_* (hand-created database), KV_* (Vercel Marketplace default),
  // Chainscore_KV_* (what the Marketplace actually injected for this
  // project: the store was connected with a "Chainscore" env prefix, and
  // marketplace-managed vars cannot be renamed). Absent all three pairs,
  // rate limiting stays per-instance in-memory.
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  Chainscore_KV_REST_API_URL: z.string().optional(),
  Chainscore_KV_REST_API_TOKEN: z.string().optional(),

  // ---- Autopilot agent layer (all optional: agents are off until keys and
  // flags exist; nothing here may ever be NEXT_PUBLIC_) ----
  // Model access for agent runs.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Channel keys (marketing agent). Server-side only.
  RESEND_API_KEY: z.string().optional(),
  NEYNAR_API_KEY: z.string().optional(),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),
  // Kill switch (G7): 'true' halts every agent at the orchestrator.
  AGENTS_KILL_SWITCH: z.string().optional(),
  // Vercel Cron authenticates to /api/agents/cron with this bearer secret.
  CRON_SECRET: z.string().optional(),
  // Owner token for the /admin/autopilot dashboard (cookie-gated).
  ADMIN_DASH_TOKEN: z.string().optional(),
  // Where the nightly digest email goes (requires RESEND_API_KEY).
  DIGEST_EMAIL: z.string().optional(),
  // Per-agent feature flags: 'true' enables. Default off.
  AGENT_STRATEGY_ENABLED: z.string().optional(),
  AGENT_ENGINEERING_ENABLED: z.string().optional(),
  AGENT_MARKETING_ENABLED: z.string().optional(),
  // Spend caps (G2), read from config never from a model decision. Zero or
  // absent means no spend is possible even when approved. Units: USD/day.
  SPEND_CAP_DAILY_USD: z.coerce.number().min(0).default(0),
  SPEND_CAP_CHANNEL_DAILY_USD: z.coerce.number().min(0).default(0),
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
