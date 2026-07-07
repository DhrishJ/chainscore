import { prisma } from '@/lib/db'
import { env } from '@/lib/env.server'
import { validateAgainstRegistry } from '@/lib/facts/registry'
import { checkEmailCompliance, checkFraud, UNSUBSCRIBE_TOKEN } from './antifraud'

// The publish pipeline (G6): full content autonomy with exactly three
// automated brakes, all code errors and never human approvals:
//   1. the Facts Registry validator (no unverified numbers)
//   2. the anti-fraud check (no fabricated social proof), plus CAN-SPAM
//      for email
//   3. per-channel cadence caps (account safety only, config-tunable)
// Anything PAID routes through the outbox spend gate instead; nothing in
// this module can move money. Channels without configured keys accept the
// content as GENERATED with a note instead of posting, so the engine runs
// end to end before accounts exist.

export type Channel = 'x' | 'farcaster' | 'email' | 'seo' | 'video'

// Posts per UTC day per channel. Exists to keep accounts alive, not to slow
// the agent down; tune freely.
export const CADENCE_CAPS: Record<Channel, number> = {
  x: 12,
  farcaster: 16,
  email: 1,
  seo: 4,
  video: 4,
}

export interface PublishResult {
  status: 'POSTED' | 'BLOCKED' | 'GENERATED'
  contentId: string
  note: string
}

export class PublishBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublishBlockedError'
  }
}

function withUtm(text: string, channel: Channel): string {
  return text.replace(/https:\/\/chainscore\.dev(\/[\w/#-]*)?/g, (url) => {
    const joiner = url.includes('?') ? '&' : '?'
    return `${url}${joiner}utm_source=${channel}&utm_medium=autopilot`
  })
}

async function postedTodayCount(channel: Channel): Promise<number> {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  return prisma.contentItem.count({
    where: { channel, status: 'POSTED', postedAt: { gte: since } },
  })
}

// Channel adapters. Each returns an external id when it actually posted, or
// null when the channel is not configured yet (content stays GENERATED).
async function postToChannel(channel: Channel, title: string | null, body: string): Promise<string | null> {
  switch (channel) {
    case 'x': {
      if (!env.X_API_KEY || !env.X_ACCESS_TOKEN) return null
      // OAuth1 signing for the X v2 API lands when credentials exist to
      // test against; until then the channel reports unconfigured.
      return null
    }
    case 'farcaster': {
      if (!env.NEYNAR_API_KEY) return null
      const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
        method: 'POST',
        headers: { 'x-api-key': env.NEYNAR_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body.slice(0, 1024) }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`neynar http ${response.status}`)
      const data = (await response.json()) as { cast?: { hash?: string } }
      return data.cast?.hash ?? 'posted'
    }
    case 'email': {
      if (!env.RESEND_API_KEY || !env.DIGEST_EMAIL) return null
      // Until a real list exists, sends go to the owner as a proof channel.
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'ChainScore <hello@chainscore.dev>',
          to: [env.DIGEST_EMAIL],
          subject: title ?? 'ChainScore update',
          text: body.replace(UNSUBSCRIBE_TOKEN, 'https://chainscore.dev/unsubscribe'),
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`resend http ${response.status}`)
      return 'sent'
    }
    case 'seo':
    case 'video':
      // SEO pages ship through the deploy gate (G1/G4: code changes), and
      // video is a production handoff. Both are packaged, never auto-posted.
      return null
  }
}

export async function publishContent(input: {
  channel: Channel
  title?: string
  body: string
  factKeys?: string[]
  scheduledFor?: Date
}): Promise<PublishResult> {
  const body = withUtm(input.body, input.channel)

  // Brake 1: the Facts Registry validator.
  const facts = await validateAgainstRegistry(`${input.title ?? ''}\n${body}`)
  // Brake 2: anti-fraud, plus CAN-SPAM on email.
  const fraud = checkFraud(`${input.title ?? ''}\n${body}`)
  const emailCompliance = input.channel === 'email' ? checkEmailCompliance(body) : { ok: true, violations: [] }

  if (!facts.ok || !fraud.ok || !emailCompliance.ok) {
    const reasons = [
      ...facts.violations.map((v) => `facts: ${v.reason}`),
      ...fraud.violations.map((v) => `fraud: ${v.reason}`),
      ...emailCompliance.violations.map((v) => `email: ${v.reason}`),
    ].join(' | ')
    const item = await prisma.contentItem.create({
      data: {
        channel: input.channel,
        status: 'BLOCKED',
        title: input.title,
        body,
        factKeys: input.factKeys?.join(','),
        metricsJson: JSON.stringify({ blocked: reasons.slice(0, 2_000) }),
      },
    })
    throw new PublishBlockedError(`BLOCKED (${item.id}): ${reasons.slice(0, 600)}`)
  }

  // Brake 3: cadence cap for account safety.
  const todays = await postedTodayCount(input.channel)
  if (todays >= CADENCE_CAPS[input.channel]) {
    const item = await prisma.contentItem.create({
      data: {
        channel: input.channel,
        status: 'GENERATED',
        title: input.title,
        body,
        factKeys: input.factKeys?.join(','),
        scheduledFor: input.scheduledFor,
        metricsJson: JSON.stringify({ deferred: `cadence cap ${CADENCE_CAPS[input.channel]}/day reached` }),
      },
    })
    return { status: 'GENERATED', contentId: item.id, note: 'Cadence cap reached; queued for tomorrow.' }
  }

  const externalId = await postToChannel(input.channel, input.title ?? null, body)

  const item = await prisma.contentItem.create({
    data: {
      channel: input.channel,
      status: externalId ? 'POSTED' : 'GENERATED',
      title: input.title,
      body,
      factKeys: input.factKeys?.join(','),
      scheduledFor: input.scheduledFor,
      externalId: externalId ?? undefined,
      postedAt: externalId ? new Date() : undefined,
    },
  })

  return externalId
    ? { status: 'POSTED', contentId: item.id, note: `Posted to ${input.channel} (${externalId}).` }
    : {
        status: 'GENERATED',
        contentId: item.id,
        note: `${input.channel} passed all checks but the channel is not configured yet; stored ready-to-post.`,
      }
}
