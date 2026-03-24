import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWalletSignature } from '@/lib/auth'
import { isAddress } from 'viem'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { address, signature, message, loanId, revieweeAddress, rating, comment } = body

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const valid = await verifyWalletSignature(address, message, signature)
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  if (!loanId || !revieweeAddress || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Invalid review data' }, { status: 400 })
  }

  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  if (!loan || loan.status !== 'REPAID') {
    return NextResponse.json({ error: 'Can only review completed loans' }, { status: 403 })
  }

  const addr = address.toLowerCase()
  const isParty = loan.lenderAddress === addr || loan.borrowerAddress === addr
  if (!isParty) return NextResponse.json({ error: 'Not a party to this loan' }, { status: 403 })

  const existing = await prisma.review.findFirst({
    where: { loanId, reviewerAddress: addr },
  })
  if (existing) return NextResponse.json({ error: 'Already reviewed this loan' }, { status: 409 })

  const review = await prisma.review.create({
    data: {
      loanId,
      reviewerAddress: addr,
      revieweeAddress: revieweeAddress.toLowerCase(),
      rating,
      comment: comment || null,
    },
  })

  await prisma.notification.create({
    data: {
      address: revieweeAddress.toLowerCase(),
      type: 'NEW_REVIEW',
      title: 'New Review Received',
      message: `${addr.slice(0, 6)}...${addr.slice(-4)} left you a ${rating}/5 review.`,
      link: `/profile/${revieweeAddress}`,
    },
  })

  return NextResponse.json(review, { status: 201 })
}
