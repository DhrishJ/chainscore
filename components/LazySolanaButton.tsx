'use client'
import dynamic from 'next/dynamic'

// Client-only, lazily loaded Solana connect button. ssr:false keeps the heavy
// wallet-adapter tree out of the server render and the initial JS chunk; it
// loads after hydration. A fixed-size placeholder reserves space so there is
// no layout shift when it swaps in.
const SolanaWalletIsland = dynamic(() => import('@/components/SolanaWalletIsland'), {
  ssr: false,
  loading: () => <div className="h-9 w-9" aria-hidden="true" />,
})

export function LazySolanaButton() {
  return <SolanaWalletIsland />
}
