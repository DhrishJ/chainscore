import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const revalidate = 300 // 5 minutes

export async function GET() {
  try {
    const [activeListings, completedLoans, totalVolumeResult, avgScoreResult] = await Promise.all([
      prisma.loanListing.count({ where: { status: 'OPEN' } }),
      prisma.loan.count({ where: { status: 'REPAID' } }),
      prisma.loan.aggregate({
        _sum: { amount: true },
        where: { status: { in: ['REPAID', 'ACTIVE'] } },
      }),
      prisma.wallet.aggregate({ _avg: { score: true } }),
    ])

    return NextResponse.json({
      activeListings,
      completedLoans,
      totalVolume: totalVolumeResult._sum.amount || 0,
      averageScore: Math.round(avgScoreResult._avg.score || 0),
    })
  } catch {
    return NextResponse.json({
      activeListings: 0,
      completedLoans: 0,
      totalVolume: 0,
      averageScore: 0,
    })
  }
}
