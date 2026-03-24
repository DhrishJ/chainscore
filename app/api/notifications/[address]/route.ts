import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isAddress } from 'viem'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const addr = params.address.toLowerCase()
  if (!isAddress(addr)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: { address: addr },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unreadCount = notifications.filter((n) => !n.read).length
    return NextResponse.json({ notifications, unreadCount })
  } catch {
    return NextResponse.json({ notifications: [], unreadCount: 0 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const addr = params.address.toLowerCase()
  const body = await req.json()
  const { ids } = body

  try {
    if (ids === 'all') {
      await prisma.notification.updateMany({
        where: { address: addr },
        data: { read: true },
      })
    } else if (Array.isArray(ids)) {
      await prisma.notification.updateMany({
        where: { id: { in: ids }, address: addr },
        data: { read: true },
      })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[PATCH /api/notifications]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
