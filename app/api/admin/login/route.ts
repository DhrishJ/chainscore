import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/env.server'

// Owner login for the Autopilot dashboard: exchange the ADMIN_DASH_TOKEN
// for an httpOnly cookie. Constant-time comparison is unnecessary at this
// threat level (single owner token behind IP rate limiting), but we avoid
// echoing anything and always answer 303 to the same places.

const bodySchema = z.object({ token: z.string().min(1).max(500) })

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!env.ADMIN_DASH_TOKEN) {
    return NextResponse.json({ error: 'Disabled' }, { status: 404 })
  }
  const form = await request.formData().catch(() => null)
  const parsed = bodySchema.safeParse({ token: form?.get('token') })
  if (!parsed.success || parsed.data.token !== env.ADMIN_DASH_TOKEN) {
    return NextResponse.redirect(new URL('/admin/login?error=1', request.url), 303)
  }
  const response = NextResponse.redirect(new URL('/admin/autopilot', request.url), 303)
  response.cookies.set('cs-admin', parsed.data.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
  return response
}
