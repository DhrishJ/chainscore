import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/apiKey'
import { addressParamSchema, chainSlugSchema } from '@/lib/validation'
import { scoreEvmWallet } from '@/lib/scoring/live'

export const dynamic = 'force-dynamic'

// Versioned partner scoring endpoint (Workstream E). Authenticated with a
// bearer API key, returns the full versioned envelope (model score, integrity
// penalty, provenance, freshness). The unversioned /api/score stays alive with
// a deprecation header for the existing web client.
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
    return NextResponse.json({ error: 'Solana scoring is not available on the v1 API yet' }, { status: 501 })
  }

  const { envelope, error } = await scoreEvmWallet(address, chainSlug)
  if (error || !envelope) {
    return NextResponse.json({ error: error?.message ?? 'Scoring failed' }, { status: error?.status ?? 500 })
  }

  return NextResponse.json(envelope, {
    headers: {
      'Cache-Control': 'no-store',
      'X-ChainScore-Model-Version': envelope.modelVersion,
      'X-ChainScore-Cached': String(envelope.cached),
    },
  })
}
