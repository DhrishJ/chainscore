import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { evmOrSolanaAddressSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

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
    const [wallet, listings, applications, activeLoans, loanHistory, reviewsReceived] =
      await Promise.all([
        prisma.wallet.findUnique({
          where: { address: addr },
          include: {
            scoreHistory: { orderBy: { timestamp: 'asc' }, take: 30 },
          },
        }),
        prisma.loanListing.findMany({
          where: { lenderAddress: addr },
          include: { _count: { select: { applications: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.loanApplication.findMany({
          where: { borrowerAddress: addr },
          include: {
            listing: {
              include: { lender: { select: { ens: true, score: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.loan.findMany({
          where: {
            OR: [{ lenderAddress: addr }, { borrowerAddress: addr }],
            status: 'ACTIVE',
          },
          include: {
            lender: { select: { address: true, ens: true, score: true } },
            borrower: { select: { address: true, ens: true, score: true } },
          },
        }),
        prisma.loan.findMany({
          where: {
            OR: [{ lenderAddress: addr }, { borrowerAddress: addr }],
            status: { in: ['REPAID', 'DEFAULTED', 'LIQUIDATED'] },
          },
          include: { reviews: true },
          orderBy: { startDate: 'desc' },
          take: 20,
        }),
        prisma.review.findMany({
          where: { revieweeAddress: addr },
          include: { reviewer: { select: { address: true, ens: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ])

    const totalLent = loanHistory
      .filter((l) => l.lenderAddress === addr)
      .reduce((s, l) => s + l.amount, 0)
    const totalBorrowed = loanHistory
      .filter((l) => l.borrowerAddress === addr)
      .reduce((s, l) => s + l.amount, 0)
    const completedLoans = loanHistory.filter((l) => l.status === 'REPAID').length
    const avgRating = reviewsReceived.length
      ? reviewsReceived.reduce((s, r) => s + r.rating, 0) / reviewsReceived.length
      : null

    return NextResponse.json({
      wallet,
      stats: {
        totalLent,
        totalBorrowed,
        completedLoans,
        avgRating,
        totalListings: listings.length,
      },
      listings,
      applications,
      activeLoans,
      loanHistory,
      reviewsReceived,
    })
  } catch (e) {
    console.error('[GET /api/dashboard/[address]]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
