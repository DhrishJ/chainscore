import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyAuthorizedAction } from '@/lib/authNonce'
import { isAddress } from 'viem'
import { cuidSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const manageBodySchema = z.object({
  address: z.string().min(1).max(64),
  nonceId: z.string().min(1).max(128),
  signature: z.string().min(1).max(2048),
  // A lender may only cancel a listing. Every other transition belongs to
  // the loan lifecycle (accept flow) and must never come from this endpoint.
  status: z.enum(['EXPIRED']).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!cuidSchema.safeParse(params.id).success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const listing = await prisma.loanListing.findUnique({
      where: { id: params.id },
      include: {
        lender: {
          select: {
            address: true,
            ens: true,
            score: true,
            grade: true,
            percentile: true,
            scoreHistory: { orderBy: { timestamp: 'desc' }, take: 10 },
          },
        },
        applications: {
          include: {
            borrower: { select: { address: true, ens: true, score: true, grade: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        loan: true,
      },
    })

    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    return NextResponse.json(listing)
  } catch (e) {
    console.error('[GET /api/listings/[id]]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function authorizeLender(
  req: NextRequest,
  listingId: string
): Promise<{ ok: true; body: z.infer<typeof manageBodySchema> } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
  const parsed = manageBodySchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  }
  const { address, nonceId, signature } = parsed.data

  if (!isAddress(address)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid address' }, { status: 400 }) }
  }
  const auth = await verifyAuthorizedAction({ address, action: 'manage_listing', nonceId, signature })
  if (!auth.ok) {
    return { ok: false, response: NextResponse.json({ error: auth.error }, { status: auth.status }) }
  }

  const listing = await prisma.loanListing.findUnique({ where: { id: listingId } })
  if (!listing) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  if (listing.lenderAddress !== address.toLowerCase()) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, body: parsed.data }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await authorizeLender(req, params.id)
  if (!result.ok) return result.response

  const updated = await prisma.loanListing.update({
    where: { id: params.id },
    data: { status: result.body.status ?? 'EXPIRED' },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await authorizeLender(req, params.id)
  if (!result.ok) return result.response

  await prisma.loanListing.update({
    where: { id: params.id },
    data: { status: 'EXPIRED' },
  })
  return NextResponse.json({ success: true })
}
