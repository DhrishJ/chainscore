import { describe, expect, it, vi } from 'vitest'
import {
  dispatchScoreChange,
  isMaterialChange,
  signPayload,
  verifySignature,
  newWebhookSecret,
  ScoreChangeEvent,
  WebhookStore,
  WebhookSubscriptionRecord,
} from '@/lib/scoring/webhooks'

const event: ScoreChangeEvent = {
  type: 'score.changed',
  address: '0xabc',
  chain: 'ethereum',
  previousScore: 700,
  score: 640,
  modelVersion: 'v5-xgb-cal',
  asOf: new Date().toISOString(),
}

describe('signature', () => {
  it('round-trips a valid signature', () => {
    const body = JSON.stringify(event)
    const secret = newWebhookSecret()
    const sig = signPayload(body, secret)
    expect(verifySignature(body, secret, sig)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const secret = newWebhookSecret()
    const sig = signPayload(JSON.stringify(event), secret)
    expect(verifySignature(JSON.stringify({ ...event, score: 850 }), secret, sig)).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const body = JSON.stringify(event)
    const sig = signPayload(body, newWebhookSecret())
    expect(verifySignature(body, newWebhookSecret(), sig)).toBe(false)
  })
})

describe('isMaterialChange', () => {
  it('notifies on the first score', () => {
    expect(isMaterialChange(null, 700)).toBe(true)
  })
  it('ignores sub-threshold jitter', () => {
    expect(isMaterialChange(700, 705)).toBe(false)
  })
  it('notifies on a material move', () => {
    expect(isMaterialChange(700, 640)).toBe(true)
  })
})

describe('dispatchScoreChange', () => {
  function store(subs: WebhookSubscriptionRecord[]): WebhookStore {
    return {
      async create() {},
      async findActiveFor() {
        return subs
      },
    }
  }

  it('signs and delivers to every active subscription', async () => {
    const sub: WebhookSubscriptionRecord = {
      id: 's1',
      apiKeyId: 'k1',
      address: '0xabc',
      chain: 'ethereum',
      url: 'https://partner.example/hook',
      secret: 'whsec_test',
      createdAt: new Date(),
      revokedAt: null,
    }
    const calls: Array<{ url: string; sig: string; body: string }> = []
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      calls.push({ url: String(url), sig: headers['X-ChainScore-Signature'], body: String(init?.body) })
      return new Response('ok', { status: 200 })
    })
    const count = await dispatchScoreChange(event, store([sub]), fakeFetch as unknown as typeof fetch)
    expect(count).toBe(1)
    expect(calls[0].url).toBe(sub.url)
    expect(verifySignature(calls[0].body, sub.secret, calls[0].sig)).toBe(true)
  })

  it('does not throw when a partner endpoint fails', async () => {
    const sub: WebhookSubscriptionRecord = {
      id: 's1', apiKeyId: 'k1', address: '0xabc', chain: 'ethereum',
      url: 'https://down.example/hook', secret: 'whsec_test', createdAt: new Date(), revokedAt: null,
    }
    const failing = vi.fn(async () => { throw new Error('connection refused') })
    await expect(dispatchScoreChange(event, store([sub]), failing as unknown as typeof fetch)).resolves.toBe(1)
  })
})
