import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/env.server'
import { approveAction, rejectAction, executeAction, OutboxRefusalError } from '@/lib/agents/outbox'

// Approve / reject / execute an outbox item from the dashboard. Defense in
// depth: middleware already gates /admin, but this API route re-checks the
// owner cookie itself, so the control does not depend on the matcher.

const bodySchema = z.object({
  action: z.enum(['approve', 'reject', 'execute']),
  note: z.string().max(2000).optional(),
})

function isOwner(request: NextRequest): boolean {
  return Boolean(env.ADMIN_DASH_TOKEN) && request.cookies.get('cs-admin')?.value === env.ADMIN_DASH_TOKEN
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!isOwner(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const parsed = bodySchema.safeParse({
    action: form?.get('action'),
    note: form?.get('note') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  try {
    if (parsed.data.action === 'approve') await approveAction(params.id, 'owner')
    else if (parsed.data.action === 'reject') await rejectAction(params.id, 'owner', parsed.data.note)
    else await executeAction(params.id)
  } catch (e) {
    if (e instanceof OutboxRefusalError) {
      return NextResponse.redirect(
        new URL(`/admin/autopilot?refused=${encodeURIComponent(e.message.slice(0, 200))}`, request.url),
        303
      )
    }
    throw e
  }
  return NextResponse.redirect(new URL('/admin/autopilot', request.url), 303)
}
