import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyAuthorizedAction } from '@/lib/authNonce'
import { isAddress } from 'viem'
import { calculateFee } from '@/lib/fees'
import { calculateOfferedAPR } from '@/lib/apr'

const patchBodySchema = z.object({
  address: z.string().min(1).max(64),
  nonceId: z.string().min(1).max(128),
  signature: z.string().min(1).max(2048),
  action: z.enum(['withdraw', 'accept', 'reject']),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = patchBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { address, nonceId, signature, action } = parsed.data

  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const auth = await verifyAuthorizedAction({ address, action: 'manage_application', nonceId, signature })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const application = await prisma.loanApplication.findUnique({
    where: { id: params.id },
    include: { listing: true, borrower: true },
  })
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const addr = address.toLowerCase()

  // Borrower can withdraw
  if (action === 'withdraw') {
    if (application.borrowerAddress !== addr) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const updated = await prisma.loanApplication.update({
      where: { id: params.id },
      data: { status: 'WITHDRAWN' },
    })
    return NextResponse.json(updated)
  }

  // Only lender can accept/reject
  if (application.listing.lenderAddress !== addr) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (action === 'reject') {
    const updated = await prisma.loanApplication.update({
      where: { id: params.id },
      data: { status: 'REJECTED' },
    })
    await prisma.notification.create({
      data: {
        address: application.borrowerAddress,
        type: 'APPLICATION_REJECTED',
        title: 'Application Not Accepted',
        message: `Your application for ${application.listing.amount} ${application.listing.currency} was not accepted.`,
        link: `/marketplace/${application.listingId}`,
      },
    })
    return NextResponse.json(updated)
  }

  if (action === 'accept') {
    const offeredAPR = calculateOfferedAPR(
      application.borrowerScore,
      application.listing.minBorrowerScore,
      application.listing.minAPR,
      application.listing.maxAPR
    )
    const collateralAmount =
      application.requestedAmount * (application.listing.collateralRequired / 100)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + application.listing.durationDays)
    const feeAmount = calculateFee(application.requestedAmount)

    // Transaction: update application + create loan + update listing
    const [updatedApp, loan] = await prisma.$transaction(async (tx) => {
      const app = await tx.loanApplication.update({
        where: { id: params.id },
        data: { status: 'ACCEPTED' },
      })
      const newLoan = await tx.loan.create({
        data: {
          listingId: application.listingId,
          applicationId: params.id,
          lenderAddress: application.listing.lenderAddress,
          borrowerAddress: application.borrowerAddress,
          amount: application.requestedAmount,
          currency: application.listing.currency,
          APR: offeredAPR,
          collateralAmount,
          collateralCurrency: 'ETH',
          dueDate,
          feeAmount,
        },
      })
      await tx.loanListing.update({
        where: { id: application.listingId },
        data: { status: 'MATCHED' },
      })
      return [app, newLoan]
    })

    await prisma.notification.create({
      data: {
        address: application.borrowerAddress,
        type: 'APPLICATION_ACCEPTED',
        title: 'Application Accepted!',
        message: `Your loan application was accepted. ${application.requestedAmount} ${application.listing.currency} at ${offeredAPR}% APR.`,
        link: `/dashboard`,
      },
    })

    return NextResponse.json({ application: updatedApp, loan })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
