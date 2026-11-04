'use client'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '@/lib/wagmi'
import '@rainbow-me/rainbowkit/styles.css'

// The heavy EVM wallet subtree: wagmi + viem + RainbowKit + react-query,
// roughly 900 KB of transfer. Never import this module statically from
// anything on the critical path; it is loaded on demand by EvmGate
// (DECISIONS.md D-032).

const queryClient = new QueryClient()

function RainbowWrapper({ children }: { children: React.ReactNode }) {
  // One theme: the wallet modal matches the site (light on studio black,
  // square corners).
  const rkTheme = darkTheme({ accentColor: '#ECEAE5', accentColorForeground: '#0B0B0C', borderRadius: 'none' })
  return <RainbowKitProvider theme={rkTheme}>{children}</RainbowKitProvider>
}

export function EvmProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowWrapper>{children}</RainbowWrapper>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
