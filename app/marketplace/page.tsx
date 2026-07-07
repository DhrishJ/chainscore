import { Suspense } from 'react'
import Link from 'next/link'
import { MarketplaceShell } from './MarketplaceShell'

export const metadata = {
  title: 'Loan Marketplace (Preview)',
  description:
    'Browse open loan offers from scored lenders. Apply with your ChainScore. Preview: matching is not live yet.',
}

export default function MarketplacePage() {
  return (
    <main className="min-h-screen px-4 py-8 max-w-7xl mx-auto">
      {/* Preview banner (docs/MARKETPLACE_DECISION.md Option B): visibly
          experimental until the API business proves demand; no funds flow. */}
      <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2.5">
        <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-warning" aria-hidden />
        <p className="text-xs leading-relaxed text-text">
          The marketplace is a preview. Listings and applications work, but loan matching is not
          live yet and no funds move through ChainScore.
        </p>
      </div>
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
