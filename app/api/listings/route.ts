import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyAuthorizedAction } from '@/lib/authNonce'
import { isSolanaAddress } from '@/lib/solanaAuth'
import { isAddress } from 'viem'
import type { Prisma } from '@prisma/client'
import { listingsQuerySchema, parseOrError } from '@/lib/validation'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const rawQuery = {
    currency: searchParams.get('currency') || undefined,
    minAmount: searchParams.get('minAmount') || undefined,
    maxAmount: searchParams.get('maxAmount') || undefined,
    minAPR: searchParams.get('minAPR') || undefined,
    maxAPR: searchParams.get('maxAPR') || undefined,
    minDuration: searchParams.get('minDuration') || undefined,
    maxDuration: searchParams.get('maxDuration') || undefined,
    minLenderScore: searchParams.get('minLenderScore') || undefined,
    chain: searchParams.get('chain') || undefined, // 'EVM' | 'SOLANA' | undefined
    sort: searchParams.get('sort') || undefined,
    page: searchParams.get('page') || undefined,
  }

  const parsedQuery = parseOrError(listingsQuerySchema, rawQuery)
  if (!parsedQuery.ok) return parsedQuery.response

  const {
    currency,
    minAmount,
    maxAmount,
    minAPR,
    maxAPR,
    minDuration,
    maxDuration,
    minLenderScore,
    chain,
    sort,
    page,
  } = parsedQuery.data
  const limit = 20

  const where: Prisma.LoanListingWhereInput = { status: 'OPEN', expiresAt: { gt: new Date() } }
  if (currency) where.currency = currency
  if (chain) where.chain = chain
  if (minAmount !== undefined || maxAmount !== undefined) {
    where.amount = {}
    if (minAmount !== undefined) where.amount.gte = minAmount
    if (maxAmount !== undefined) where.amount.lte = maxAmount
  }
  if (minAPR !== undefined) where.minAPR = { gte: minAPR }
  if (maxAPR !== undefined) where.maxAPR = { lte: maxAPR }
  if (minDuration !== undefined && maxDuration !== undefined) {
    where.durationDays = { gte: minDuration, lte: maxDuration }
  } else if (minDuration !== undefined) {
    where.durationDays = { gte: minDuration }
  } else if (maxDuration !== undefined) {
    where.durationDays = { lte: maxDuration }
  }
  if (minLenderScore !== undefined) where.lenderScore = { gte: minLenderScore }

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

const listingSchema = z
  .object({
    amount: z.coerce.number().positive().finite().max(1_000_000_000),
    currency: z.string().regex(/^[A-Za-z0-9]{2,10}$/),
    minAPR: z.coerce.number().min(0).max(1000),
    maxAPR: z.coerce.number().min(0).max(1000),
    durationDays: z.coerce.number().int().min(1).max(3650),
    minBorrowerScore: z.coerce.number().int().min(300).max(850),
    collateralRequired: z.coerce.number().min(0).max(1000),
    expiresAt: z.coerce.date(),
    terms: z.string().max(2000).optional().default(''),
  })
  .refine((l) => l.maxAPR >= l.minAPR, { message: 'maxAPR must be >= minAPR' })
  .refine((l) => l.expiresAt.getTime() > Date.now(), { message: 'expiresAt must be in the future' })

const createBodySchema = z.object({
  address: z.string().min(1).max(64),
  nonceId: z.string().min(1).max(128),
  signature: z.string().min(1).max(2048),
  listing: listingSchema,
})

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createBodySchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json(
      { error: `Invalid listing: ${issue.path.join('.')} ${issue.message}` },
      { status: 400 }
    )
  }
  const { address, nonceId, signature, listing } = parsed.data

  const isSol = isSolanaAddress(address)
  if (!isSol && !isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const auth = await verifyAuthorizedAction({ address, action: 'create_listing', nonceId, signature })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const walletAddress = isSol ? address : address.toLowerCase()
  const wallet = await prisma.wallet.findUnique({ where: { address: walletAddress } })
  if (!wallet || wallet.score < 500) {
    return NextResponse.json({ error: 'ChainScore of 500+ required to post a listing' }, { status: 403 })
  }

  const newListing = await prisma.loanListing.create({
    data: {
      lenderAddress: walletAddress,
      lenderScore: wallet.score,
      amount: listing.amount,
      currency: listing.currency.toUpperCase(),
      minAPR: listing.minAPR,
      maxAPR: listing.maxAPR,
      durationDays: listing.durationDays,
      minBorrowerScore: listing.minBorrowerScore,
      collateralRequired: listing.collateralRequired,
      expiresAt: listing.expiresAt,
      terms: listing.terms,
      chain: isSol ? 'SOLANA' : 'EVM',
    },
  })

  return NextResponse.json(newListing, { status: 201 })
}
