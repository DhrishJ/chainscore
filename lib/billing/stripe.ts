import { createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { clientEnv } from '@/lib/env.client'
import { PLANS, type PlanId } from '@/lib/pricing/plans'

// Draft Stripe integration (Section 9 / docs/PRICING.md section 4). Flag-gated
// and key-free: every function here degrades to a safe no-op when Stripe
// credentials are absent, so shipping this file changes no runtime behavior
// until a human supplies real keys.
//
// HUMAN FOLLOW-UP REQUIRED before go-live:
//  1. Register STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the
//     lib/env.server.ts schema (both z.string().optional(), same convention
//     as the other optional integration keys there). lib/env.server.ts is a
//     protected path for this agent, so that edit was deliberately not made
//     here; process.env is read directly in this module only, which is the
//     one sanctioned exception to "only env.server.ts reads process.env"
//     until that registration lands.
//  2. Create the actual Stripe account, webhook endpoint (pointed at
//     /api/billing/webhook), and copy both values into the deployment env.
//  3. Decide whether Starter/Growth should use pre-created Stripe Price
//     objects instead of the inline price_data this draft uses (inline
//     pricing avoids needing more env vars per plan, but pre-created prices
//     are usually preferred for reporting inside the Stripe dashboard).
//  4. This module intentionally does not depend on the `stripe` npm package
//     (out of scope for this PR); createCheckoutUrl talks to the Stripe REST
//     API directly over fetch, and the webhook route verifies signatures
//     with node:crypto. Swapping in the official SDK later is optional.

function stripeSecretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY
}

function stripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET
}

// True only once both Stripe credentials exist. Every entry point below
// checks this first; nothing here ever partially activates.
export function billingEnabled(): boolean {
  return Boolean(stripeSecretKey() && stripeWebhookSecret())
}

// ---- Signature verification (Stripe-Signature header) ----
//
// Header shape: "t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>...]". Stripe
// signs `${timestamp}.${rawBody}` with HMAC-SHA256 using the webhook signing
// secret; multiple v1 values appear during secret rotation, any match is
// accepted. This is a from-scratch reimplementation of that one algorithm,
// not a general Stripe client.

export interface ParsedSignatureHeader {
  timestamp: number
  signatures: string[]
}

export function parseStripeSignatureHeader(header: string): ParsedSignatureHeader | null {
  let timestamp: number | null = null
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (!key || value === undefined) continue
    if (key === 't') {
      const t = Number.parseInt(value, 10)
      if (Number.isFinite(t)) timestamp = t
    } else if (key === 'v1') {
      signatures.push(value)
    }
  }
  if (timestamp === null || signatures.length === 0) return null
  return { timestamp, signatures }
}

export type SignatureVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_header' | 'malformed_header' | 'signature_mismatch' | 'timestamp_out_of_tolerance' }

// Pure: secret and "now" are both parameters so this is exercised with a
// constructed test vector instead of real Stripe traffic.
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowMs: number = Date.now()
): SignatureVerifyResult {
  if (!header) return { ok: false, reason: 'missing_header' }
  const parsed = parseStripeSignatureHeader(header)
  if (!parsed) return { ok: false, reason: 'malformed_header' }

  const expected = createHmac('sha256', secret).update(`${parsed.timestamp}.${payload}`).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const matches = parsed.signatures.some((sig) => {
    try {
      const sigBuf = Buffer.from(sig, 'hex')
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)
    } catch {
      return false
    }
  })
  if (!matches) return { ok: false, reason: 'signature_mismatch' }

  const skewSeconds = Math.abs(nowMs / 1000 - parsed.timestamp)
  if (skewSeconds > toleranceSeconds) return { ok: false, reason: 'timestamp_out_of_tolerance' }

  return { ok: true }
}

// Env-reading wrapper the webhook route calls. Fails closed with
// 'missing_header' framing (via the underlying secret being undefined,
// which never matches any signature) if billing is disabled; the route
// checks billingEnabled() first regardless, so this path should not
// normally be hit while disabled.
export function verifyWebhookRequest(rawBody: string, signatureHeader: string | null): SignatureVerifyResult {
  const secret = stripeWebhookSecret()
  if (!secret) return { ok: false, reason: 'missing_header' }
  return verifyStripeSignature(rawBody, signatureHeader, secret)
}

// ---- Event routing (checkout + subscription lifecycle) ----

export const stripeEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }),
})

export type StripeEvent = z.infer<typeof stripeEventSchema>

export interface SubscriptionUpsert {
  apiKeyId: string
  planId: string
  status: string
}

export interface SubscriptionStore {
  upsert(input: SubscriptionUpsert): Promise<void>
}

function extractMetadata(object: Record<string, unknown>): { apiKeyId: string | null; planId: string | null } {
  const metadata = object.metadata
  if (!metadata || typeof metadata !== 'object') return { apiKeyId: null, planId: null }
  const record = metadata as Record<string, unknown>
  const apiKeyId = typeof record.apiKeyId === 'string' ? record.apiKeyId : null
  const planId = typeof record.planId === 'string' ? record.planId : null
  return { apiKeyId, planId }
}

export interface RouteEventResult {
  handled: boolean
}

// Pure with respect to persistence: the store is injected so the routing
// decision (which events matter, what status they map to) is unit-testable
// without a database. Unknown event types and events missing the metadata
// ChainScore itself set at checkout are ignored, not errored: Stripe sends
// many event types this integration does not need to react to.
export async function routeStripeEvent(event: StripeEvent, store: SubscriptionStore): Promise<RouteEventResult> {
  const object = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      const { apiKeyId, planId } = extractMetadata(object)
      if (!apiKeyId || !planId) return { handled: false }
      await store.upsert({ apiKeyId, planId, status: 'active' })
      return { handled: true }
    }
    case 'customer.subscription.updated': {
      const { apiKeyId, planId } = extractMetadata(object)
      if (!apiKeyId || !planId) return { handled: false }
      const status = typeof object.status === 'string' ? object.status : 'active'
      await store.upsert({ apiKeyId, planId, status })
      return { handled: true }
    }
    case 'customer.subscription.deleted': {
      const { apiKeyId, planId } = extractMetadata(object)
      if (!apiKeyId || !planId) return { handled: false }
      await store.upsert({ apiKeyId, planId, status: 'canceled' })
      return { handled: true }
    }
    default:
      return { handled: false }
  }
}

// overageCapUsd is deliberately absent from this upsert: it stays at the
// prisma schema default (currently $50, see DEFAULT_OVERAGE_CAP_USD) on
// create, and is left untouched on update. Billing sets plan and status
// only; the customer's overage cap is a separate, customer-controlled
// setting this integration does not manage.
export const prismaSubscriptionStore: SubscriptionStore = {
  async upsert({ apiKeyId, planId, status }) {
    await prisma.subscription.upsert({
      where: { apiKeyId },
      create: { apiKeyId, planId, status },
      update: { planId, status },
    })
  },
}

// ---- Checkout ----

const SELF_SERVE_PLANS: ReadonlySet<PlanId> = new Set(['starter', 'growth'])

// Creates a Stripe Checkout session for the given plan and returns its
// hosted URL, or null when billing is disabled, the plan is not self-serve
// (free has nothing to charge, enterprise is negotiated), or Stripe rejects
// the request. Uses inline price_data against lib/pricing/plans.ts rather
// than pre-created Stripe Price objects, so no per-plan price-id env vars
// are needed for this draft (see follow-up note above).
export async function createCheckoutUrl(
  planId: string,
  apiKeyId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  if (!billingEnabled()) return null
  if (!SELF_SERVE_PLANS.has(planId as PlanId)) return null
  const plan = PLANS[planId as PlanId]
  if (!plan.priceUsdMonthly || plan.priceUsdMonthly <= 0) return null

  const secretKey = stripeSecretKey()
  if (!secretKey) return null

  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const params = new URLSearchParams()
  params.set('mode', 'subscription')
  params.set('success_url', `${baseUrl}/dashboard?billing=success`)
  params.set('cancel_url', `${baseUrl}/pricing?billing=cancelled`)
  params.set('client_reference_id', apiKeyId)
  params.set('metadata[apiKeyId]', apiKeyId)
  params.set('metadata[planId]', planId)
  // Copied onto the created Subscription object too, so
  // customer.subscription.updated/deleted events carry the same metadata
  // checkout.session.completed does.
  params.set('subscription_data[metadata][apiKeyId]', apiKeyId)
  params.set('subscription_data[metadata][planId]', planId)
  params.set('line_items[0][quantity]', '1')
  params.set('line_items[0][price_data][currency]', 'usd')
  params.set('line_items[0][price_data][recurring][interval]', 'month')
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(plan.priceUsdMonthly * 100)))
  params.set('line_items[0][price_data][product_data][name]', `ChainScore ${plan.name}`)

  try {
    const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const json = (await response.json()) as { url?: unknown }
    return typeof json.url === 'string' ? json.url : null
  } catch (e) {
    console.error('[billing] checkout session creation failed', e instanceof Error ? e.message : e)
    return null
  }
}
