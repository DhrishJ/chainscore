import { notFound } from 'next/navigation'
import { ListingDetailClient } from './ListingDetailClient'
import { clientEnv } from '@/lib/env.client'

export const dynamic = 'force-dynamic'

async function getListing(id: string) {
  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/listings/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const listing = await getListing(params.id)
  if (!listing || listing.error) notFound()

  return <ListingDetailClient listing={listing} />
}
