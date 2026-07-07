import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { addressParamSchema, chainSlugSchema } from '@/lib/validation'
import { scoreEvmWallet } from '@/lib/scoring/live'
import { prisma } from '@/lib/db'
import { planFor, DEFAULT_OVERAGE_CAP_USD } from '@/lib/pricing/plans'
import { meterScore } from '@/lib/pricing/metering'

export const dynamic = 'force-dynamic'

// Versioned partner scoring endpoint (Workstream E). Authenticated with a
// bearer API key, returns the full versioned envelope (model score, integrity
// penalty, provenance, freshness). Metered per plan (Section 9): quota, then
// overage up to the customer's hard cap, then 429 QUOTA_EXCEEDED. The
// unversioned /api/score stays alive with a deprecation header for the web
// client.
export async function GET(req: NextRequest, { params }: { params: { address: string } }) {
  const auth = await authenticateApiKey(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const chainParsed = chainSlugSchema.safeParse(req.nextUrl.searchParams.get('chain') ?? undefined)
  const chainSlug = chainParsed.success ? chainParsed.data : 'ethereum'

  const { address } = params
  if (!addressParamSchema.safeParse(address).success) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  // Solana partner scoring is not exposed on v1 yet (the envelope integrity
  // path is EVM-only). Fail explicitly rather than silently returning a
  // different shape.
  if (chainSlug === 'solana') {
    return NextResponse.json(
      { error: 'Solana scoring is not available on the v1 API yet' },
      { status: 501 }
    )
  }

  // Meter AFTER validation: only real scoring attempts count against quota
  // (invalid addresses and unsupported chains are free, as the pricing page
  // promises). Plan lookup: absent subscription row = free tier. Metering
  // fails open; a Redis outage cannot take scoring down.
  const subscription = await prisma.subscription
    .findUnique({ where: { apiKeyId: auth.key.id } })
    .catch(() => null)
  const plan = planFor(subscription?.planId)
  const capUsd = subscription?.overageCapUsd ?? DEFAULT_OVERAGE_CAP_USD
  const meter = await meterScore(auth.key.keyHash.slice(0, 16), plan, capUsd)

  const usageHeaders = {
    'X-ChainScore-Plan': plan.id,
    'X-ChainScore-Usage': String(meter.used),
    'X-ChainScore-Quota': String(meter.quota),
  }

  if (!meter.allowed) {
    return NextResponse.json(
      {
        error:
          meter.reason === 'OVERAGE_CAP_REACHED'
            ? 'Monthly overage cap reached. Raise your cap or upgrade your plan.'
            : 'Monthly score quota exceeded for this plan.',
        code: meter.reason,
        used: meter.used,
        quota: meter.quota,
      },
      { status: 429, headers: usageHeaders }
    )
  }

  const { envelope, error } = await scoreEvmWallet(address, chainSlug)
  if (error || !envelope) {
    return NextResponse.json(
      { error: error?.message ?? 'Scoring failed' },
      { status: error?.status ?? 500, headers: usageHeaders }
    )
  }

  return NextResponse.json(envelope, {
    headers: {
      'Cache-Control': 'no-store',
      'X-ChainScore-Model-Version': envelope.modelVersion,
      'X-ChainScore-Cached': String(envelope.cached),
      ...usageHeaders,
    },
  })
}
