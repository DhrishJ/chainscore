import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { evmOrSolanaAddressSchema } from '@/lib/validation'

export const revalidate = 3600

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const parsedAddress = evmOrSolanaAddressSchema.safeParse(params.address)
  if (!parsedAddress.success) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const addr = parsedAddress.data

  try {
    const [wallet, completedLoansAsLender, completedLoansAsBorrower, reviews, activeListings] =
      await Promise.all([
        prisma.wallet.findUnique({
          where: { address: addr },
          include: {
            scoreHistory: { orderBy: { timestamp: 'asc' }, take: 20 },
          },
        }),
        prisma.loan.count({ where: { lenderAddress: addr, status: 'REPAID' } }),
        prisma.loan.count({ where: { borrowerAddress: addr, status: 'REPAID' } }),
        prisma.review.findMany({
          where: { revieweeAddress: addr },
          include: { reviewer: { select: { address: true, ens: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.loanListing.findMany({
          where: { lenderAddress: addr, status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
        }),
      ])

    const avgRating = reviews.length
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : null

    return NextResponse.json({
      wallet,
      stats: {
        completedLoansAsLender,
        completedLoansAsBorrower,
        avgRating,
        reviewCount: reviews.length,
      },
      reviews,
      activeListings,
    })
  } catch (e) {
    console.error('[GET /api/profile/[address]]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
