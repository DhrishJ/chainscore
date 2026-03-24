import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWalletSignature } from '@/lib/auth'
import { isAddress } from 'viem'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json()
  const { address, signature, message, requestedAmount, applicationMessage } = body

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const valid = await verifyWalletSignature(address, message, signature)
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  const listing = await prisma.loanListing.findUnique({ where: { id: params.id } })
  if (!listing || listing.status !== 'OPEN') {
    return NextResponse.json({ error: 'Listing not available' }, { status: 404 })
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
      requestedAmount: parseFloat(requestedAmount),
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
