'use client'
import dynamic from 'next/dynamic'
import { useEvmGate } from './EvmGate'

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
  const { ready, require } = useEvmGate()
  // Static lookalike until the wallet subtrees mount; a press arms them
  // (D-032: a second press may be needed if it beats the chunk load).
  if (!ready) {
    return (
      <button
        type="button"
        onClick={require}
        className="t-label h-9 border border-text/25 px-3 text-muted transition-colors hover:border-text/60 hover:text-text"
      >
        Solana
      </button>
    )
  }
  return <SolanaWalletIsland />
}
