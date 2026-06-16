import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWalletSignature } from '@/lib/auth'
import { verifySolanaSignature, isSolanaAddress } from '@/lib/solanaAuth'
import { isAddress } from 'viem'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const currency = searchParams.get('currency')
  const minAmount = searchParams.get('minAmount')
  const maxAmount = searchParams.get('maxAmount')
  const minAPR = searchParams.get('minAPR')
  const maxAPR = searchParams.get('maxAPR')
  const minDuration = searchParams.get('minDuration')
  const maxDuration = searchParams.get('maxDuration')
  const minLenderScore = searchParams.get('minLenderScore')
  const chain = searchParams.get('chain') // 'EVM' | 'SOLANA' | null
  const sort = searchParams.get('sort') || 'newest'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = 20

  const where: Prisma.LoanListingWhereInput = { status: 'OPEN', expiresAt: { gt: new Date() } }
  if (currency) where.currency = currency
  if (chain) where.chain = chain
  if (minAmount || maxAmount) {
    where.amount = {}
    if (minAmount) where.amount.gte = parseFloat(minAmount)
    if (maxAmount) where.amount.lte = parseFloat(maxAmount)
  }
  if (minAPR) where.minAPR = { gte: parseFloat(minAPR) }
  if (maxAPR) where.maxAPR = { lte: parseFloat(maxAPR) }
  if (minDuration && maxDuration) {
    where.durationDays = { gte: parseInt(minDuration), lte: parseInt(maxDuration) }
  } else if (minDuration) {
    where.durationDays = { gte: parseInt(minDuration) }
  } else if (maxDuration) {
    where.durationDays = { lte: parseInt(maxDuration) }
  }
  if (minLenderScore) where.lenderScore = { gte: parseInt(minLenderScore) }

  const orderBy =
    sort === 'lowest_apr' ? { minAPR: 'asc' as const } :
    sort === 'highest_lender_score' ? { lenderScore: 'desc' as const } :
    sort === 'amount' ? { amount: 'desc' as const } :
    { createdAt: 'desc' as const }

  try {
    const [listings, total] = await Promise.all([
      prisma.loanListing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: { lender: { select: { ens: true, score: true } } },
      }),
      prisma.loanListing.count({ where }),
    ])
    return NextResponse.json({ listings, total, page, pages: Math.ceil(total / limit) })
  } catch (e) {
    console.error('[GET /api/listings]', e)
    return NextResponse.json({ listings: [], total: 0, page: 1, pages: 0 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { address, signature, message, listing } = body

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  const isSol = isSolanaAddress(address)

  // Verify signature
  let valid = false
  if (isSol) {
    valid = verifySolanaSignature(address, message, signature)
  } else {
    if (!isAddress(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
    }
    valid = await verifyWalletSignature(address, message, signature)
  }
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const walletAddress = isSol ? address : address.toLowerCase()
  const wallet = await prisma.wallet.findUnique({ where: { address: walletAddress } })
  if (!wallet || wallet.score < 500) {
    return NextResponse.json({ error: 'ChainScore of 500+ required to post a listing' }, { status: 403 })
  }

  const { amount, currency, minAPR, maxAPR, durationDays, minBorrowerScore, collateralRequired, expiresAt, terms } = listing

  if (!amount || !currency || minAPR == null || maxAPR == null || !durationDays || !minBorrowerScore || !collateralRequired || !expiresAt) {
    return NextResponse.json({ error: 'Missing required listing fields' }, { status: 400 })
  }

  const newListing = await prisma.loanListing.create({
    data: {
      lenderAddress: walletAddress,
      lenderScore: wallet.score,
      amount: parseFloat(amount),
      currency,
      minAPR: parseFloat(minAPR),
      maxAPR: parseFloat(maxAPR),
      durationDays: parseInt(durationDays),
      minBorrowerScore: parseInt(minBorrowerScore),
      collateralRequired: parseFloat(collateralRequired),
      expiresAt: new Date(expiresAt),
      terms: terms || '',
      chain: isSol ? 'SOLANA' : 'EVM',
    },
  })

  return NextResponse.json(newListing, { status: 201 })
}
