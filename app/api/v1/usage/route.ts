import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { prisma } from '@/lib/db'
import { planFor, DEFAULT_OVERAGE_CAP_USD } from '@/lib/pricing/plans'
import { getCurrentUsage, usageSummary } from '@/lib/pricing/metering'

export const dynamic = 'force-dynamic'

// Read-only usage lookup for the partner API (Workstream E / Section 9).
// Authenticated exactly like /api/v1/score. Reads the caller's current
// monthly count without incrementing it, so calling this endpoint never
// costs the caller quota. Absent subscription row = free tier, same
// convention as the score route.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const subscription = await prisma.subscription
    .findUnique({ where: { apiKeyId: auth.key.id } })
    .catch(() => null)
  const plan = planFor(subscription?.planId)
  const capUsd = subscription?.overageCapUsd ?? DEFAULT_OVERAGE_CAP_USD

  const used = await getCurrentUsage(auth.key.keyHash.slice(0, 16))

  return NextResponse.json(usageSummary(plan, used, capUsd), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
