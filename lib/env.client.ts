import { z } from 'zod'

// Client-safe environment. NEXT_PUBLIC_ variables are inlined into the
// browser bundle at build time, so they must be referenced with literal
// property access below (dynamic lookup would not be inlined).
//
// Everything here is public by definition. Anything secret belongs in
// lib/env.server.ts.

const schema = z.object({
  // Optional on purpose: callers keep their own historical fallbacks
  // (chainscore.dev in prod-facing surfaces, localhost in self-fetching
  // pages) so Phase 0 changes no behavior.
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().optional(),
})

export const clientEnv = schema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
})
