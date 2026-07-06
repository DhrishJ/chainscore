import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env.server'
import { runOrchestrator, productionDeps } from '@/lib/agents/orchestrator'
import { sendDigest } from '@/lib/agents/digest'

// Orchestrator entry point. Two callers:
//  - Vercel Cron (vercel.json), which sends Authorization: Bearer CRON_SECRET
//  - a manual trigger from the admin dashboard (same admin cookie the
//    dashboard uses)
// Without CRON_SECRET configured, the route is disabled outright: an
// unauthenticated orchestrator trigger is not acceptable even for a no-op.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(request: NextRequest): boolean {
  if (env.CRON_SECRET) {
    const header = request.headers.get('authorization')
    if (header === `Bearer ${env.CRON_SECRET}`) return true
  }
  if (env.ADMIN_DASH_TOKEN) {
    const cookie = request.cookies.get('cs-admin')?.value
    if (cookie === env.ADMIN_DASH_TOKEN) return true
  }
  return false
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!env.CRON_SECRET && !env.ADMIN_DASH_TOKEN) {
    return NextResponse.json({ error: 'Orchestrator disabled: no CRON_SECRET configured' }, { status: 503 })
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runOrchestrator(productionDeps())
  const digest = await sendDigest().catch((e) => ({
    sent: false,
    reason: e instanceof Error ? e.message : 'digest failed',
  }))

  return NextResponse.json({ ...result, digest })
}
