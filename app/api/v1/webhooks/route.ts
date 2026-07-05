import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { authenticateApiKey } from '@/lib/apiKey'
import { newWebhookSecret } from '@/lib/scoring/webhooks'
import { evmOrSolanaAddressSchema, chainSlugSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  address: evmOrSolanaAddressSchema,
  chain: chainSlugSchema,
  // Only https callbacks, to avoid delivering signed events over plaintext.
  url: z.string().url().refine((u) => u.startsWith('https://'), { message: 'url must be https' }),
})

// Register a score-change webhook for a watched wallet. Authenticated with a
// partner API key; the returned secret signs every delivery and is shown once.
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const secret = newWebhookSecret()
  try {
    const id = randomBytes(12).toString('hex')
    await prisma.webhookSubscription.create({
      data: {
        id,
        apiKeyId: auth.key.id,
        address: parsed.data.address,
        chain: parsed.data.chain,
        url: parsed.data.url,
        secret,
      },
    })
    // Secret is returned once here and never again.
    return NextResponse.json({ id, secret, address: parsed.data.address, chain: parsed.data.chain, url: parsed.data.url }, { status: 201 })
  } catch (e) {
    console.error('[POST /api/v1/webhooks]', e)
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }
}
