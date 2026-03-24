import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWalletSignature } from '@/lib/auth'
import { isAddress } from 'viem'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json()
  const { address, signature, message, status } = body

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const valid = await verifyWalletSignature(address, message, signature)
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  const listing = await prisma.loanListing.findUnique({ where: { id: params.id } })
  if (!listing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (listing.lenderAddress !== address.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await prisma.loanListing.update({
    where: { id: params.id },
    data: { status },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json()
  const { address, signature, message } = body

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const valid = await verifyWalletSignature(address, message, signature)
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  const listing = await prisma.loanListing.findUnique({ where: { id: params.id } })
  if (!listing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (listing.lenderAddress !== address.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.loanListing.update({
    where: { id: params.id },
    data: { status: 'EXPIRED' },
  })
  return NextResponse.json({ success: true })
}
