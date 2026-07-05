'use client'
import { SolanaWalletProvider } from '@/components/SolanaWalletProvider'
import { MarketplaceClient } from './MarketplaceClient'

// The marketplace is the only page body that reads Solana wallet context
// (MarketplaceClient calls useWallet). Now that the provider is no longer
// global, it wraps the marketplace here. The wallet-adapter tree code-splits
// into the marketplace route chunk and never loads on other pages.
export function MarketplaceShell() {
  return (
    <SolanaWalletProvider>
      <MarketplaceClient />
    </SolanaWalletProvider>
  )
}
