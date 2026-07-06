'use client'
import dynamic from 'next/dynamic'
import { useEvmReady } from './EvmGate'

// Client-only, lazily loaded Solana connect button. ssr:false keeps the heavy
// wallet-adapter tree out of the server render; gating on the EvmGate signal
// keeps its download off the critical path too, since dynamic() would
// otherwise fetch the chunk immediately at hydration (D-032). The wallet
// subtrees mount together: first interaction or the idle fallback. A
// fixed-size placeholder reserves space so there is no layout shift.
const SolanaWalletIsland = dynamic(() => import('@/components/SolanaWalletIsland'), {
  ssr: false,
  loading: () => <div className="h-9 w-9" aria-hidden="true" />,
})

export function LazySolanaButton() {
  const ready = useEvmReady()
  if (!ready) return <div className="h-9 w-9" aria-hidden="true" />
  return <SolanaWalletIsland />
}
