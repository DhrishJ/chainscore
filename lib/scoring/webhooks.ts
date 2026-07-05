import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'

// Score-change webhooks (Workstream E). A partner subscribes a (wallet, chain)
// with a callback URL and a secret; when the score changes materially,
// ChainScore POSTs a signed event. Signature lets the partner verify the
// payload came from ChainScore and was not tampered with.

export interface WebhookSubscriptionRecord {
  id: string
  apiKeyId: string
  address: string
  chain: string
  url: string
  secret: string
  createdAt: Date
  revokedAt: Date | null
}

export interface WebhookStore {
  create(record: Omit<WebhookSubscriptionRecord, 'createdAt' | 'revokedAt'>): Promise<void>
  findActiveFor(address: string, chain: string): Promise<WebhookSubscriptionRecord[]>
}

export interface ScoreChangeEvent {
  type: 'score.changed'
  address: string
  chain: string
  previousScore: number | null
  score: number
  modelVersion: string
  asOf: string
}

// HMAC-SHA256 over the exact JSON body, hex encoded. The partner recomputes
// this over the raw body with their secret and compares.
export function signPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

export function verifySignature(body: string, secret: string, signature: string): boolean {
  const expected = signPayload(body, secret)
  if (expected.length !== signature.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`
}

const prismaStore: WebhookStore = {
  async create(record) {
    await prisma.webhookSubscription.create({ data: record })
  },
  async findActiveFor(address, chain) {
    return prisma.webhookSubscription.findMany({
      where: { address: address.toLowerCase(), chain, revokedAt: null },
    })
  },
}

// Deliver an event to every active subscription for the wallet. Best-effort
// and non-blocking: a failing partner endpoint is logged, never retried inline
// (a durable retry queue is a later addition), and never blocks the score
// response. Returns the number of deliveries attempted.
export async function dispatchScoreChange(
  event: ScoreChangeEvent,
  store: WebhookStore = prismaStore,
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  let subs: WebhookSubscriptionRecord[]
  try {
    subs = await store.findActiveFor(event.address, event.chain)
  } catch (e) {
    console.warn('[webhooks] subscription lookup failed:', e instanceof Error ? e.message : e)
    return 0
  }

  const body = JSON.stringify(event)
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        const res = await fetchImpl(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ChainScore-Signature': signPayload(body, sub.secret),
            'X-ChainScore-Event': event.type,
          },
          body,
        })
        if (!res.ok) console.warn(`[webhooks] ${sub.url} responded ${res.status}`)
      } catch (e) {
        console.warn(`[webhooks] delivery to ${sub.url} failed:`, e instanceof Error ? e.message : e)
      }
    })
  )
  return subs.length
}

// A material change worth notifying: score moved by at least `minDelta`
// points, or a flag state flipped. Avoids notifying on noise.
export function isMaterialChange(previous: number | null, current: number, minDelta = 10): boolean {
  if (previous === null) return true
  return Math.abs(current - previous) >= minDelta
}
