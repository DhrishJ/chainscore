import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyAuthorizedAction } from '@/lib/authNonce'
import { isAddress } from 'viem'

const reviewBodySchema = z.object({
  address: z.string().min(1).max(64),
  nonceId: z.string().min(1).max(128),
  signature: z.string().min(1).max(2048),
  loanId: z.string().regex(/^[a-z0-9]{20,32}$/),
  revieweeAddress: z.string().min(1).max(64),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
})

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = reviewBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid review data' }, { status: 400 })
  }
  const { address, nonceId, signature, loanId, revieweeAddress, rating, comment } = parsed.data

  if (!isAddress(address) || !isAddress(revieweeAddress)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const auth = await verifyAuthorizedAction({ address, action: 'create_review', nonceId, signature })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
