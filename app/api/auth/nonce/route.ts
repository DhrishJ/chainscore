import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAddress } from 'viem'
import { AUTH_ACTIONS, issueNonce } from '@/lib/authNonce'
import { isSolanaAddress } from '@/lib/solanaAuth'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  address: z.string().min(1).max(64),
  action: z.enum(AUTH_ACTIONS),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid nonce request' }, { status: 400 })
  }

  const { address, action } = parsed.data
  if (!isAddress(address) && !isSolanaAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    const issued = await issueNonce(address, action)
    return NextResponse.json(issued, { status: 201 })
  } catch (e) {
    console.error('[POST /api/auth/nonce]', e)
    return NextResponse.json({ error: 'Failed to issue nonce' }, { status: 500 })
  }
}
