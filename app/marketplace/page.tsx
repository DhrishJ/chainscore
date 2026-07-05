import { Suspense } from 'react'
import Link from 'next/link'
import { MarketplaceShell } from './MarketplaceShell'

export const metadata = {
  title: 'Loan Marketplace | ChainScore',
  description: 'Browse open loan offers from scored lenders. Apply with your ChainScore.',
}

export default function MarketplacePage() {
  return (
    <main className="min-h-screen px-4 py-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-grotesk text-3xl font-bold tracking-[-0.02em] text-text">Loan Marketplace</h1>
          <p className="text-pretty text-muted mt-1 text-sm">
            Browse verified loan offers from scored lenders
          </p>
        </div>
        <Link
          href="/marketplace/create"
          className="rounded-xl bg-accent text-background font-semibold px-5 py-2.5 text-sm transition-all hover:bg-accent/90 active:translate-y-px"
        >
          Post a Listing
        </Link>
      </div>
      <Suspense
        fallback={
          <div className="text-muted animate-pulse text-sm">Loading listings...</div>
        }
      >
        <MarketplaceShell />
      </Suspense>
    </main>
  )
}
