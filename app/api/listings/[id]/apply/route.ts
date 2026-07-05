import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyAuthorizedAction } from '@/lib/authNonce'
import { isAddress } from 'viem'

const applyBodySchema = z.object({
  address: z.string().min(1).max(64),
  nonceId: z.string().min(1).max(128),
  signature: z.string().min(1).max(2048),
  requestedAmount: z.coerce.number().positive().finite().max(1_000_000_000),
  applicationMessage: z.string().max(1000).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = applyBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid application data' }, { status: 400 })
  }
  const { address, nonceId, signature, requestedAmount, applicationMessage } = parsed.data

  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const auth = await verifyAuthorizedAction({ address, action: 'apply_listing', nonceId, signature })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const listing = await prisma.loanListing.findUnique({ where: { id: params.id } })
  if (!listing || listing.status !== 'OPEN') {
    return NextResponse.json({ error: 'Listing not available' }, { status: 404 })
  }
  if (requestedAmount > listing.amount) {
    return NextResponse.json({ error: 'Requested amount exceeds the listing amount' }, { status: 400 })
  }

  const borrowerWallet = await prisma.wallet.findUnique({
    where: { address: address.toLowerCase() },
  })
  if (!borrowerWallet) {
    return NextResponse.json({ error: 'Wallet not scored yet. Get your ChainScore first.' }, { status: 403 })
  }
  if (borrowerWallet.score < listing.minBorrowerScore) {
    return NextResponse.json(
      { error: `Score too low. Minimum required: ${listing.minBorrowerScore}. Your score: ${borrowerWallet.score}` },
      { status: 403 }
    )
  }

  const existing = await prisma.loanApplication.findFirst({
    where: {
      listingId: params.id,
      borrowerAddress: address.toLowerCase(),
      status: { in: ['PENDING', 'ACCEPTED'] },
    },
  })
  if (existing) return NextResponse.json({ error: 'Already applied to this listing' }, { status: 409 })

  const application = await prisma.loanApplication.create({
    data: {
      listingId: params.id,
      borrowerAddress: address.toLowerCase(),
      borrowerScore: borrowerWallet.score,
      requestedAmount,
      message: applicationMessage || null,
    },
  })

  // Notify lender
  await prisma.notification.create({
    data: {
      address: listing.lenderAddress,
      type: 'NEW_APPLICATION',
      title: 'New Loan Application',
      message: `${address.slice(0, 6)}...${address.slice(-4)} applied to your ${listing.amount} ${listing.currency} listing (Score: ${borrowerWallet.score})`,
      link: `/marketplace/${params.id}`,
    },
  })

  return NextResponse.json(application, { status: 201 })
}
