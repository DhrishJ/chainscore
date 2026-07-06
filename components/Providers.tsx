'use client'
import { ThemeProvider } from '@/lib/theme'
import { EvmGate } from './EvmGate'

// Only the cheap providers are global. The EVM wallet subtree (wagmi +
// RainbowKit + react-query, ~900 KB) mounts on demand through EvmGate
// (D-032), and the Solana wallet provider loads lazily via LazySolanaButton
// and MarketplaceShell, so neither wallet stack taxes first paint.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <EvmGate>{children}</EvmGate>
    </ThemeProvider>
  )
}
