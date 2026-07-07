import { createHmac } from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  billingEnabled,
  createCheckoutUrl,
  parseStripeSignatureHeader,
  routeStripeEvent,
  verifyStripeSignature,
  verifyWebhookRequest,
  type StripeEvent,
  type SubscriptionStore,
  type SubscriptionUpsert,
} from '@/lib/billing/stripe'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

// A known test vector: constructed exactly like Stripe would sign a
// webhook (HMAC-SHA256 of "${timestamp}.${payload}", hex encoded), so the
// verifier is exercised against the real algorithm rather than a mock.
function signTestVector(payload: string, secret: string, timestamp: number): string {
  const signed = `${timestamp}.${payload}`
  return createHmac('sha256', secret).update(signed).digest('hex')
}

describe('parseStripeSignatureHeader', () => {
  it('parses timestamp and one or more v1 signatures', () => {
    const parsed = parseStripeSignatureHeader('t=1700000000,v1=abc123,v1=def456')
    expect(parsed).toEqual({ timestamp: 1700000000, signatures: ['abc123', 'def456'] })
  })

  it('rejects a header missing the timestamp', () => {
    expect(parseStripeSignatureHeader('v1=abc123')).toBeNull()
  })

  it('rejects a header missing any v1 signature', () => {
    expect(parseStripeSignatureHeader('t=1700000000')).toBeNull()
  })
})

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_known_vector'
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' })
  const timestamp = 1_700_000_000

  it('accepts a correctly signed payload within tolerance', () => {
    const sig = signTestVector(payload, secret, timestamp)
    const header = `t=${timestamp},v1=${sig}`
    const nowMs = (timestamp + 10) * 1000
    expect(verifyStripeSignature(payload, header, secret, 300, nowMs)).toEqual({ ok: true })
  })

  it('accepts when the matching signature is not the first v1 value (rotation)', () => {
    const sig = signTestVector(payload, secret, timestamp)
    const header = `t=${timestamp},v1=deadbeef,v1=${sig}`
    const nowMs = timestamp * 1000
    expect(verifyStripeSignature(payload, header, secret, 300, nowMs)).toEqual({ ok: true })
  })

  it('rejects a tampered payload', () => {
    const sig = signTestVector(payload, secret, timestamp)
    const header = `t=${timestamp},v1=${sig}`
    const tampered = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted' })
    const result = verifyStripeSignature(tampered, header, secret, 300, timestamp * 1000)
    expect(result).toEqual({ ok: false, reason: 'signature_mismatch' })
  })

  it('rejects the wrong secret', () => {
    const sig = signTestVector(payload, secret, timestamp)
    const header = `t=${timestamp},v1=${sig}`
    const result = verifyStripeSignature(payload, header, 'whsec_wrong', 300, timestamp * 1000)
    expect(result).toEqual({ ok: false, reason: 'signature_mismatch' })
  })

  it('rejects a timestamp outside tolerance (replay protection)', () => {
    const sig = signTestVector(payload, secret, timestamp)
    const header = `t=${timestamp},v1=${sig}`
    const farFutureMs = (timestamp + 10_000) * 1000
    const result = verifyStripeSignature(payload, header, secret, 300, farFutureMs)
    expect(result).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' })
  })

  it('rejects a missing header', () => {
    expect(verifyStripeSignature(payload, null, secret)).toEqual({ ok: false, reason: 'missing_header' })
  })

  it('rejects a malformed header', () => {
    expect(verifyStripeSignature(payload, 'not-a-real-header', secret)).toEqual({
      ok: false,
      reason: 'malformed_header',
    })
  })
})

describe('billingEnabled / verifyWebhookRequest (env-gated)', () => {
  it('is disabled with no Stripe env vars set', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    expect(fresh.billingEnabled()).toBe(false)
  })

  it('is disabled with only one of the two keys set', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    expect(fresh.billingEnabled()).toBe(false)
  })

  it('is enabled once both keys are set', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_123')
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    expect(fresh.billingEnabled()).toBe(true)
  })

  it('verifyWebhookRequest reads the secret from the environment', async () => {
    const secret = 'whsec_env_vector'
    const payload = JSON.stringify({ id: 'evt_2', type: 'customer.subscription.updated' })
    const timestamp = Math.floor(Date.now() / 1000)
    const sig = signTestVector(payload, secret, timestamp)
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret)
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    expect(fresh.verifyWebhookRequest(payload, `t=${timestamp},v1=${sig}`)).toEqual({ ok: true })
  })

  it('verifyWebhookRequest fails closed when disabled', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    expect(fresh.verifyWebhookRequest('{}', 't=1,v1=abc').ok).toBe(false)
  })
})

describe('routeStripeEvent', () => {
  function makeStore(): { store: SubscriptionStore; calls: SubscriptionUpsert[] } {
    const calls: SubscriptionUpsert[] = []
    return {
      calls,
      store: {
        async upsert(input) {
          calls.push(input)
        },
      },
    }
  }

  function event(type: string, object: Record<string, unknown>): StripeEvent {
    return { id: 'evt_test', type, data: { object } }
  }

  it('upserts an active subscription on checkout.session.completed', async () => {
    const { store, calls } = makeStore()
    const result = await routeStripeEvent(
      event('checkout.session.completed', { metadata: { apiKeyId: 'key_1', planId: 'starter' } }),
      store
    )
    expect(result.handled).toBe(true)
    expect(calls).toEqual([{ apiKeyId: 'key_1', planId: 'starter', status: 'active' }])
  })

  it('carries the Stripe subscription status through on customer.subscription.updated', async () => {
    const { store, calls } = makeStore()
    const result = await routeStripeEvent(
      event('customer.subscription.updated', {
        status: 'past_due',
        metadata: { apiKeyId: 'key_1', planId: 'growth' },
      }),
      store
    )
    expect(result.handled).toBe(true)
    expect(calls).toEqual([{ apiKeyId: 'key_1', planId: 'growth', status: 'past_due' }])
  })

  it('marks canceled on customer.subscription.deleted', async () => {
    const { store, calls } = makeStore()
    const result = await routeStripeEvent(
      event('customer.subscription.deleted', { metadata: { apiKeyId: 'key_1', planId: 'growth' } }),
      store
    )
    expect(result.handled).toBe(true)
    expect(calls).toEqual([{ apiKeyId: 'key_1', planId: 'growth', status: 'canceled' }])
  })

  it('ignores events missing the metadata ChainScore itself sets at checkout', async () => {
    const { store, calls } = makeStore()
    const result = await routeStripeEvent(event('checkout.session.completed', {}), store)
    expect(result.handled).toBe(false)
    expect(calls).toEqual([])
  })

  it('ignores unknown event types without error', async () => {
    const { store, calls } = makeStore()
    const result = await routeStripeEvent(event('invoice.paid', { metadata: {} }), store)
    expect(result.handled).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('createCheckoutUrl', () => {
  it('returns null when billing is disabled', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    const url = await fresh.createCheckoutUrl('starter', 'key_1')
    expect(url).toBeNull()
  })

  it('returns null for a plan that is not self-serve, even when enabled', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_123')
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    expect(await fresh.createCheckoutUrl('free', 'key_1')).toBeNull()
    expect(await fresh.createCheckoutUrl('enterprise', 'key_1')).toBeNull()
    expect(await fresh.createCheckoutUrl('nonsense', 'key_1')).toBeNull()
  })

  it('calls the Stripe REST API and returns the session url when enabled', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_123')
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    let capturedUrl: string | undefined
    let capturedBody: string | undefined
    let capturedAuth: string | undefined
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url)
      capturedBody = String(init?.body)
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization
      return {
        ok: true,
        json: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }),
      }
    })
    const url = await fresh.createCheckoutUrl('growth', 'key_1', fakeFetch as unknown as typeof fetch)
    expect(url).toBe('https://checkout.stripe.com/c/pay/cs_test_123')
    expect(capturedUrl).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(capturedAuth).toBe('Bearer sk_test_123')
    const params = new URLSearchParams(capturedBody)
    expect(params.get('metadata[apiKeyId]')).toBe('key_1')
    expect(params.get('metadata[planId]')).toBe('growth')
    expect(params.get('subscription_data[metadata][apiKeyId]')).toBe('key_1')
  })

  it('returns null when Stripe responds with an error status', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_123')
    vi.resetModules()
    const fresh = await import('@/lib/billing/stripe')
    const fakeFetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    const url = await fresh.createCheckoutUrl('starter', 'key_1', fakeFetch as unknown as typeof fetch)
    expect(url).toBeNull()
  })
})
